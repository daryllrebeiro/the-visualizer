import { describe, expect, it } from 'vitest';

import { DeterministicRNG } from '../../prng/deterministic-rng.js';
import { FeatureStoreInvariantChecker } from './feature-store-invariants.js';
import {
  createDefaultFeatureStoreCluster,
  pointInTimeLookup,
  pureFeatureStoreTransition,
} from './feature-store-state-transitions.js';
import type { FeatureStoreClusterState, FeatureStoreSimEvent } from './feature-store-types.js';

function ev(state: FeatureStoreClusterState, event: FeatureStoreSimEvent, rng: DeterministicRNG): FeatureStoreClusterState {
  return pureFeatureStoreTransition(state, event, rng).nextState;
}

describe('Feature Store Domain Fidelity Test Suite', () => {
  it('FS-1: point-in-time join uses only values available BEFORE the label timestamp', () => {
    const rng = new DeterministicRNG(1);
    let state = createDefaultFeatureStoreCluster();

    // The seeded timeline for (user-1, user_avg_spend):
    //   t=1: 42, t=6: 55, t=11: 61, t=16: 77.
    // Join at T=10: the PIT value is 55 (t=6), NOT 61 (t=11) or 77 (t=16).
    state = ev(
      state,
      { id: 'join', tick: 10, type: 'FS_JOIN_TRAINING_SET', payload: { setId: 'ts-t10', labelTimestamp: 10 } },
      rng,
    );

    const set = state.trainingSets['ts-t10']!;
    const row = set.rows.find((r) => r.entity === 'user-1' && r.feature === 'user_avg_spend');
    expect(row).toBeDefined();
    expect(row?.value).toBe(55);
    expect(row?.sourceEventTime).toBe(6);
    expect(row?.sourceEventTime).toBeLessThanOrEqual(10);

    // Direct PIT lookup parity at several timestamps.
    expect(pointInTimeLookup(state, 'user-1', 'user_avg_spend', 5)?.value).toBe(42);
    expect(pointInTimeLookup(state, 'user-1', 'user_avg_spend', 6)?.value).toBe(55);
    expect(pointInTimeLookup(state, 'user-1', 'user_avg_spend', 0)).toBeNull();
    expect(pointInTimeLookup(state, 'user-1', 'user_avg_spend', 100)?.value).toBe(77);

    const checker = new FeatureStoreInvariantChecker();
    expect(checker.check(state)).toBeUndefined();
  });

  it('FS-1: invariant checker catches a leaky training row (future value in a materialized set)', () => {
    const rng = new DeterministicRNG(2);
    let state = createDefaultFeatureStoreCluster();
    state = ev(
      state,
      { id: 'join', tick: 10, type: 'FS_JOIN_TRAINING_SET', payload: { setId: 'ts-leaky', labelTimestamp: 10 } },
      rng,
    );

    // Tamper: the row "joined" the t=16 value (77) — future data leak.
    const tampered = JSON.parse(JSON.stringify(state)) as FeatureStoreClusterState;
    const row = tampered.trainingSets['ts-leaky']!.rows.find(
      (r) => r.entity === 'user-1' && r.feature === 'user_avg_spend',
    )!;
    row.value = 77;
    row.sourceEventTime = 16;

    const checker = new FeatureStoreInvariantChecker();
    const violation = checker.check(tampered);
    expect(violation).toBeDefined();
    expect(violation?.ruleId).toBe('FS-1');
    expect(violation?.description).toContain('leaked');
  });

  it('FS-2: online store matches offline at the sync watermark; sync lag is visible before the next sync', () => {
    const rng = new DeterministicRNG(3);
    let state = createDefaultFeatureStoreCluster();

    // Sync at tick 5: online = offline as-of 5 (eventTime 6 value is
    // NOT yet available — that is the whole point of PIT).
    state = ev(state, { id: 'sync', tick: 5, type: 'FS_SYNC_ONLINE', payload: {} }, rng);
    expect(state.onlineStore['user-1']?.['user_avg_spend']?.value).toBe(42); // PIT at 5
    expect(state.syncWatermark['user_avg_spend']).toBe(5);

    // Ingest a new offline value AFTER the watermark.
    state = ev(
      state,
      { id: 'ing', tick: 7, type: 'FS_INGEST_OFFLINE', payload: { entity: 'user-1', feature: 'user_avg_spend', value: 90, eventTime: 7 } },
      rng,
    );
    // Online still 42 — the sync lag window (documented, allowed).
    expect(state.onlineStore['user-1']?.['user_avg_spend']?.value).toBe(42);
    // The checker holds at the watermark: online == offline@watermark.
    const checker = new FeatureStoreInvariantChecker();
    expect(checker.check(state)).toBeUndefined();

    // Next sync catches up.
    state = ev(state, { id: 'sync2', tick: 9, type: 'FS_SYNC_ONLINE', payload: {} }, rng);
    expect(state.onlineStore['user-1']?.['user_avg_spend']?.value).toBe(90);
    expect(checker.check(state)).toBeUndefined();
  });

  it('FS-2: invariant checker catches online/offline divergence at the watermark', () => {
    const rng = new DeterministicRNG(4);
    let state = createDefaultFeatureStoreCluster();
    state = ev(state, { id: 'sync', tick: 5, type: 'FS_SYNC_ONLINE', payload: {} }, rng);

    // Tamper: online drifted from the offline value at the watermark.
    const tampered = JSON.parse(JSON.stringify(state)) as FeatureStoreClusterState;
    const online = tampered.onlineStore['user-1']!['user_avg_spend']!;
    online.value = 999; // skew

    const checker = new FeatureStoreInvariantChecker();
    const violation = checker.check(tampered);
    expect(violation).toBeDefined();
    expect(violation?.ruleId).toBe('FS-2');
    expect(violation?.description).toContain('skew');
  });

  it('FS-3: online lookups past the TTL are flagged stale, never silently served', () => {
    const rng = new DeterministicRNG(5);
    let state = createDefaultFeatureStoreCluster();
    state = ev(state, { id: 'sync', tick: 5, type: 'FS_SYNC_ONLINE', payload: {} }, rng);

    // Fresh at the boundary (age 10 == TTL 10).
    state = ev(state, { id: 'serve-fresh', tick: 15, type: 'FS_SERVE', payload: { entity: 'user-1' } }, rng);
    expect(state.lastServing?.results.find((r) => r.feature === 'user_avg_spend')?.stale).toBe(false);

    // One tick past: stale (both features are 11 ticks old > TTL 10).
    state = ev(state, { id: 'serve-stale', tick: 16, type: 'FS_SERVE', payload: { entity: 'user-1' } }, rng);
    const result = state.lastServing?.results.find((r) => r.feature === 'user_avg_spend');
    expect(result?.stale).toBe(true);
    expect(result?.ageTicks).toBe(11);
    expect(state.stats.staleServes).toBe(2);

    // Missing entity: value null, flagged stale (never silently empty).
    state = ev(state, { id: 'serve-missing', tick: 16, type: 'FS_SERVE', payload: { entity: 'user-99' } }, rng);
    expect(state.lastServing?.results.every((r) => r.stale)).toBe(true);

    const checker = new FeatureStoreInvariantChecker();
    expect(checker.check(state)).toBeUndefined();
  });

  it('FS-3: invariant checker catches a stale value served as current', () => {
    const rng = new DeterministicRNG(6);
    let state = createDefaultFeatureStoreCluster();
    state = ev(state, { id: 'sync', tick: 5, type: 'FS_SYNC_ONLINE', payload: {} }, rng);
    state = ev(state, { id: 'serve', tick: 40, type: 'FS_SERVE', payload: { entity: 'user-1' } }, rng);

    // Tamper: the staleness flag was swallowed.
    const tampered = JSON.parse(JSON.stringify(state)) as FeatureStoreClusterState;
    for (const result of tampered.lastServing!.results) {
      result.stale = false;
    }

    const checker = new FeatureStoreInvariantChecker();
    const violation = checker.check(tampered);
    expect(violation).toBeDefined();
    expect(violation?.ruleId).toBe('FS-3');
    expect(violation?.description).toContain('not flagged stale');
  });

  it('FS-4: definition edits version-up; materialized sets keep their pinned versions', () => {
    const rng = new DeterministicRNG(7);
    let state = createDefaultFeatureStoreCluster();

    // Materialize a set under user_avg_spend v1.
    state = ev(
      state,
      { id: 'join', tick: 10, type: 'FS_JOIN_TRAINING_SET', payload: { setId: 'ts-v1', labelTimestamp: 10 } },
      rng,
    );
    expect(state.trainingSets['ts-v1']?.definitionVersions['user_avg_spend']).toBe(1);

    // Edit the definition: v1 -> v2.
    state = ev(
      state,
      { id: 'edit', tick: 11, type: 'FS_EDIT_DEFINITION', payload: { feature: 'user_avg_spend', computation: 'avg(transaction_amount) over 7d window' } },
      rng,
    );
    expect(state.definitions['user_avg_spend']?.version).toBe(2);
    expect(state.definitions['user_avg_spend']?.computation).toContain('7d');

    // The materialized set still resolves to v1 rows — unchanged.
    const v1set = state.trainingSets['ts-v1']!;
    const v1row = v1set.rows.find((r) => r.feature === 'user_avg_spend');
    expect(v1row?.sourceVersion).toBe(1);
    expect(v1set.definitionVersions['user_avg_spend']).toBe(1);

    // New ingests carry v2; new joins pin v2.
    state = ev(
      state,
      { id: 'ing', tick: 12, type: 'FS_INGEST_OFFLINE', payload: { entity: 'user-2', feature: 'user_avg_spend', value: 22, eventTime: 12 } },
      rng,
    );
    state = ev(
      state,
      { id: 'join2', tick: 13, type: 'FS_JOIN_TRAINING_SET', payload: { setId: 'ts-v2', labelTimestamp: 13 } },
      rng,
    );
    expect(state.trainingSets['ts-v2']?.definitionVersions['user_avg_spend']).toBe(2);
    const v2row = state.trainingSets['ts-v2']!.rows.find(
      (r) => r.entity === 'user-2' && r.feature === 'user_avg_spend',
    );
    expect(v2row?.sourceVersion).toBe(2);
    // The eventTime-12 value for user-2 also exists at v2.
    expect(v2row?.value).toBe(22);

    // Old set untouched by the edit.
    expect(state.trainingSets['ts-v1']?.rows).toEqual(v1set.rows);

    const checker = new FeatureStoreInvariantChecker();
    expect(checker.check(state)).toBeUndefined();
  });

  it('FS-4: invariant checker catches a future-version row in a materialized set', () => {
    const rng = new DeterministicRNG(8);
    let state = createDefaultFeatureStoreCluster();
    state = ev(
      state,
      { id: 'join', tick: 10, type: 'FS_JOIN_TRAINING_SET', payload: { setId: 'ts-fs4', labelTimestamp: 10 } },
      rng,
    );

    // Tamper: a row claims to have been computed by a future definition.
    const tampered = JSON.parse(JSON.stringify(state)) as FeatureStoreClusterState;
    const row = tampered.trainingSets['ts-fs4']!.rows.find(
      (r) => r.feature === 'user_avg_spend',
    )!;
    row.sourceVersion = 99;

    const checker = new FeatureStoreInvariantChecker();
    const violation = checker.check(tampered);
    expect(violation).toBeDefined();
    expect(violation?.ruleId).toBe('FS-4');
    expect(violation?.description).toContain('leaked into a materialized set');
  });

  it('offline history maintains eventTime sort order under arbitrary ingest', () => {
    const rng = new DeterministicRNG(9);
    let state = createDefaultFeatureStoreCluster();
    // Ingest out of chronological order.
    const times = [20, 3, 15, 8, 25];
    for (const t of times) {
      state = ev(
        state,
        { id: `ing-${t}`, tick: 30, type: 'FS_INGEST_OFFLINE', payload: { entity: 'user-3', feature: 'login_count', value: t * 10, eventTime: t } },
        rng,
      );
    }
    const history = state.offlineStore['user-3']?.['login_count'] ?? [];
    const eventTimes = history.map((h) => h.eventTime);
    expect([...eventTimes].sort((a, b) => a - b)).toEqual(eventTimes);

    const checker = new FeatureStoreInvariantChecker();
    expect(checker.check(state)).toBeUndefined();
  });

  it('golden determinism: identical event sequences with identical seeds produce identical state', () => {
    const runChaos = () => {
      const rng = new DeterministicRNG(42);
      let state = createDefaultFeatureStoreCluster();
      state = ev(state, { id: 'sync', tick: 5, type: 'FS_SYNC_ONLINE', payload: {} }, rng);
      state = ev(
        state,
        { id: 'ing', tick: 6, type: 'FS_INGEST_OFFLINE', payload: { entity: 'user-1', feature: 'user_avg_spend', value: 88, eventTime: 6 } },
        rng,
      );
      state = ev(
        state,
        { id: 'join', tick: 7, type: 'FS_JOIN_TRAINING_SET', payload: { setId: 'ts-golden', labelTimestamp: 7 } },
        rng,
      );
      state = ev(
        state,
        { id: 'edit', tick: 8, type: 'FS_EDIT_DEFINITION', payload: { feature: 'login_count', computation: 'count(logins) over 14d' } },
        rng,
      );
      state = ev(state, { id: 'serve', tick: 20, type: 'FS_SERVE', payload: { entity: 'user-1' } }, rng);
      for (let t = 21; t <= 30; t++) {
        state = ev(state, { id: `t${t}`, tick: t, type: 'FS_TICK', payload: {} }, rng);
      }
      return JSON.stringify(state);
    };
    expect(runChaos()).toBe(runChaos());
  });
});
