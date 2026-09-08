import { describe, expect, it } from 'vitest';

import { DeterministicRNG } from '../../prng/deterministic-rng.js';
import { fnv1a32 } from '../consistent-hashing/consistent-hashing-algorithms.js';
import { lbRingLookup, roundRobinSelect, smoothWeightedRoundRobin } from './load-balancer-algorithms.js';
import { LBInvariantChecker } from './load-balancer-invariants.js';
import { createDefaultLBCluster, pureLBTransition } from './load-balancer-state-transitions.js';
import type { LBClusterState, LBSimEvent } from './load-balancer-types.js';

function ev(state: LBClusterState, event: LBSimEvent, rng: DeterministicRNG): LBClusterState {
  return pureLBTransition(state, event, rng).nextState;
}

function chiSquareCriticalAlpha001(df: number): number {
  const table = [6.6349, 9.2103, 11.3449, 13.2767, 15.0863, 16.8119, 18.4753];
  if (df <= 7) {
    return table[df - 1] as number;
  }
  const z = 2.3263;
  const c = 1 - 2 / (9 * df) + z * Math.sqrt(2 / (9 * df));
  return df * c * c * c;
}

describe('Load Balancer Domain Fidelity Test Suite', () => {
  // ── Mode-aware routing matrix (NET-3 lesson: exact per-mode behavior) ──

  it('ROUND_ROBIN: strict cyclic order over eligible backends', () => {
    const rng = new DeterministicRNG(1);
    let state = createDefaultLBCluster();
    state = ev(state, { id: 'p', tick: 0, type: 'LB_SET_POLICY', payload: { policy: 'ROUND_ROBIN' } }, rng);
    state = ev(state, { id: 'lt', tick: 0, type: 'LB_LOAD_TEST', payload: { count: 12 } }, rng);

    // 4 eligible backends, 12 requests: exactly 3 each, in strict cycle.
    for (const b of Object.values(state.backends)) {
      expect(b.dispatchCount).toBe(3);
    }
    const order = state.routingLog.slice(-8).map((r) => r.backendId);
    expect(order).toEqual([
      'backend-1', 'backend-2', 'backend-3', 'backend-4',
      'backend-1', 'backend-2', 'backend-3', 'backend-4',
    ]);
  });

  it('WEIGHTED_RR: nginx smooth weighted round-robin gives exact 5:3:2:1 interleaving', () => {
    const rng = new DeterministicRNG(2);
    let state = createDefaultLBCluster();
    state = ev(state, { id: 'w1', tick: 0, type: 'LB_SET_WEIGHT', payload: { backendId: 'backend-1', weight: 5 } }, rng);
    state = ev(state, { id: 'w2', tick: 0, type: 'LB_SET_WEIGHT', payload: { backendId: 'backend-2', weight: 3 } }, rng);
    state = ev(state, { id: 'w3', tick: 0, type: 'LB_SET_WEIGHT', payload: { backendId: 'backend-3', weight: 2 } }, rng);
    state = ev(state, { id: 'p', tick: 0, type: 'LB_SET_POLICY', payload: { policy: 'WEIGHTED_RR' } }, rng);
    // One round = totalWeight (11) requests: exactly 5, 3, 2, 1.
    state = ev(state, { id: 'lt', tick: 0, type: 'LB_LOAD_TEST', payload: { count: 11 } }, rng);

    expect(state.backends['backend-1']!.dispatchCount).toBe(5);
    expect(state.backends['backend-2']!.dispatchCount).toBe(3);
    expect(state.backends['backend-3']!.dispatchCount).toBe(2);
    expect(state.backends['backend-4']!.dispatchCount).toBe(1);

    // Smooth WRR spreads heavy backends (no 5-in-a-row burst).
    const first8 = state.routingLog.slice(0, 8).map((r) => r.backendId);
    expect(new Set(first8).size).toBeGreaterThanOrEqual(3);
  });

  it('LEAST_CONNECTIONS: argmin(inFlight) with deterministic tie-break', () => {
    const rng = new DeterministicRNG(3);
    let state = createDefaultLBCluster();
    state = ev(state, { id: 'p', tick: 0, type: 'LB_SET_POLICY', payload: { policy: 'LEAST_CONNECTIONS' } }, rng);

    // First request: all zero in-flight -> backend-1 (id tie-break).
    state = ev(state, { id: 'r1', tick: 0, type: 'LB_REQUEST', payload: {} }, rng);
    expect(state.routingLog.at(-1)?.backendId).toBe('backend-1');

    // Second request: backend-1 now has 1 in-flight -> backend-2.
    state = ev(state, { id: 'r2', tick: 0, type: 'LB_REQUEST', payload: {} }, rng);
    expect(state.routingLog.at(-1)?.backendId).toBe('backend-2');

    // Third: backend-3.
    state = ev(state, { id: 'r3', tick: 0, type: 'LB_REQUEST', payload: {} }, rng);
    expect(state.routingLog.at(-1)?.backendId).toBe('backend-3');
    expect(state.routingLog.at(-1)?.reasoning).toContain('least connections');
  });

  it('LEAST_RESPONSE_TIME: argmin(EWMA) after observed completions', () => {
    const rng = new DeterministicRNG(4);
    let state = createDefaultLBCluster();
    state = ev(state, { id: 'p', tick: 0, type: 'LB_SET_POLICY', payload: { policy: 'LEAST_RESPONSE_TIME' } }, rng);

    // Dispatch to all four, then let connections complete with different
    // durations (rng-driven); the next request goes to the argmin-EWMA.
    for (let i = 0; i < 4; i++) {
      state = ev(state, { id: `r${i}`, tick: 0, type: 'LB_REQUEST', payload: {} }, rng);
    }
    for (let t = 1; t <= 8; t++) {
      state = ev(state, { id: `t${t}`, tick: t, type: 'LB_TICK', payload: {} }, rng);
    }
    state = ev(state, { id: 'final', tick: 9, type: 'LB_REQUEST', payload: {} }, rng);
    const ewmas = Object.values(state.backends).map((b) => ({ id: b.id, ewma: b.responseTimeEwma }));
    const min = ewmas.reduce((a, b) => (b.ewma < a.ewma ? b : a));
    expect(state.routingLog.at(-1)?.backendId).toBe(min.id);
    expect(state.routingLog.at(-1)?.reasoning).toContain('least response time');
  });

  // ── LB-2: weighted distribution over 10k requests ──

  it('LB-2: 10,000-request weighted distribution passes chi-square and stays in exact WRR counts', () => {
    const rng = new DeterministicRNG(5);
    let state = createDefaultLBCluster();
    state = ev(state, { id: 'w1', tick: 0, type: 'LB_SET_WEIGHT', payload: { backendId: 'backend-1', weight: 5 } }, rng);
    state = ev(state, { id: 'w2', tick: 0, type: 'LB_SET_WEIGHT', payload: { backendId: 'backend-2', weight: 3 } }, rng);
    state = ev(state, { id: 'w3', tick: 0, type: 'LB_SET_WEIGHT', payload: { backendId: 'backend-3', weight: 1 } }, rng);
    state = ev(state, { id: 'w4', tick: 0, type: 'LB_SET_WEIGHT', payload: { backendId: 'backend-4', weight: 1 } }, rng);
    state = ev(state, { id: 'p', tick: 0, type: 'LB_SET_POLICY', payload: { policy: 'WEIGHTED_RR' } }, rng);
    state = ev(state, { id: 'lt', tick: 0, type: 'LB_LOAD_TEST', payload: { count: 10_000 } }, rng);

    const counts = Object.values(state.backends).map((b) => b.dispatchCount);
    const total = counts.reduce((a, b) => a + b, 0);
    const expected = [5000, 3000, 1000, 1000];
    // Smooth WRR: exact ratio (10 rounds of totalWeight=10).
    expect(total).toBe(10_000);
    expect(counts).toEqual(expected);

    // Chi-square GOF (alpha=0.01, df=3) on the observed split.
    const stat = counts.reduce((acc, o, i) => acc + (o - (expected[i] as number)) ** 2 / (expected[i] as number), 0);
    expect(stat).toBeLessThan(chiSquareCriticalAlpha001(3));

    const checker = new LBInvariantChecker();
    expect(checker.check(state)).toBeUndefined();
  });

  // ── LB-1: health-gated routing ──

  it('LB-1: killing a backend fails it over via health checks; no dispatch ever lands on UNHEALTHY', () => {
    const rng = new DeterministicRNG(6);
    let state = createDefaultLBCluster();

    // Kill backend-2, then tick until the health checker marks it UNHEALTHY.
    state = ev(state, { id: 'k', tick: 1, type: 'LB_KILL_BACKEND', payload: { backendId: 'backend-2' } }, rng);
    for (let t = 2; t <= 12; t++) {
      state = ev(state, { id: `t${t}`, tick: t, type: 'LB_TICK', payload: {} }, rng);
    }
    expect(state.backends['backend-2']!.health).toBe('UNHEALTHY');

    // 1,000 more requests: none may route to backend-2.
    state = ev(state, { id: 'lt', tick: 13, type: 'LB_LOAD_TEST', payload: { count: 1_000 } }, rng);
    expect(state.backends['backend-2']!.dispatchCount).toBe(0);
    for (const log of state.routingLog) {
      expect(log.backendId).not.toBe('backend-2');
    }
    expect(state.backends['backend-1']!.dispatchCount).toBeGreaterThan(300);

    // Revive: health checker restores it after success threshold.
    state = ev(state, { id: 'rev', tick: 14, type: 'LB_REVIVE_BACKEND', payload: { backendId: 'backend-2' } }, rng);
    for (let t = 15; t <= 30; t++) {
      state = ev(state, { id: `t${t}`, tick: t, type: 'LB_TICK', payload: {} }, rng);
    }
    expect(state.backends['backend-2']!.health).toBe('HEALTHY');

    const checker = new LBInvariantChecker();
    expect(checker.check(state)).toBeUndefined();
  });

  it('LB-1: invariant checker catches a routing entry to an unhealthy backend', () => {
    const rng = new DeterministicRNG(7);
    let state = createDefaultLBCluster();
    state = ev(state, { id: 'lt', tick: 0, type: 'LB_LOAD_TEST', payload: { count: 10 } }, rng);

    const tampered = JSON.parse(JSON.stringify(state)) as LBClusterState;
    const backend = tampered.backends['backend-1']!;
    backend.health = 'UNHEALTHY';
    // Simulate a reducer bug: a dispatch to the unhealthy backend with
    // the health flag honestly recording the ineligible state.
    tampered.routingLog.push({
      requestId: 'bug-1',
      sessionKey: 'bug',
      backendId: 'backend-1',
      policy: 'ROUND_ROBIN',
      reasoning: 'bug',
      tick: 99,
      healthyAtDispatch: false,
    });

    const checker = new LBInvariantChecker();
    const violation = checker.check(tampered);
    expect(violation).toBeDefined();
    expect(violation?.ruleId).toBe('LB-1');
    expect(violation?.description).toContain('UNHEALTHY');
  });

  // ── LB-3: sticky sessions ──

  it('LB-3: consistent-hash sessions stay pinned while healthy; only the failed backend\'s keys move', () => {
    const rng = new DeterministicRNG(8);
    let state = createDefaultLBCluster();
    state = ev(state, { id: 'p', tick: 0, type: 'LB_SET_POLICY', payload: { policy: 'CONSISTENT_HASH' } }, rng);

    // 500 sessions establish assignments.
    state = ev(state, { id: 'lt', tick: 0, type: 'LB_LOAD_TEST', payload: { count: 500, sessionPrefix: 'sess' } }, rng);
    const assignmentsBefore = { ...state.stickyAssignments };
    expect(Object.keys(assignmentsBefore).length).toBe(500);

    // Re-dispatch same sessions: zero reassignments.
    state = ev(state, { id: 'lt2', tick: 1, type: 'LB_LOAD_TEST', payload: { count: 500, sessionPrefix: 'sess' } }, rng);
    for (const [key, backendId] of Object.entries(assignmentsBefore)) {
      expect(state.stickyAssignments[key]).toBe(backendId);
    }

    // Kill backend-3: only sessions pinned to it move.
    const onBackend3 = Object.entries(assignmentsBefore).filter(([, b]) => b === 'backend-3');
    state = ev(state, { id: 'k', tick: 2, type: 'LB_KILL_BACKEND', payload: { backendId: 'backend-3' } }, rng);
    for (let t = 3; t <= 14; t++) {
      state = ev(state, { id: `t${t}`, tick: t, type: 'LB_TICK', payload: {} }, rng);
    }
    expect(state.backends['backend-3']!.health).toBe('UNHEALTHY');

    let moved = 0;
    let wronglyMoved = 0;
    for (const [key, before] of Object.entries(assignmentsBefore)) {
      const after = state.stickyAssignments[key] ?? before;
      if (after !== before) {
        moved++;
        if (before !== 'backend-3') {
          wronglyMoved++;
        }
      }
    }
    expect(moved).toBe(onBackend3.length);
    expect(wronglyMoved).toBe(0);
    expect(onBackend3.length).toBeGreaterThan(50); // ~500/4 with vnodes

    const checker = new LBInvariantChecker();
    expect(checker.check(state)).toBeUndefined();
  });

  it('LB-3: invariant checker catches sticky-assignment drift from the ring', () => {
    const rng = new DeterministicRNG(9);
    let state = createDefaultLBCluster();
    state = ev(state, { id: 'p', tick: 0, type: 'LB_SET_POLICY', payload: { policy: 'CONSISTENT_HASH' } }, rng);
    state = ev(state, { id: 'lt', tick: 0, type: 'LB_LOAD_TEST', payload: { count: 50, sessionPrefix: 's' } }, rng);

    const tampered = JSON.parse(JSON.stringify(state)) as LBClusterState;
    const someKey = Object.keys(tampered.stickyAssignments)[0] as string;
    tampered.stickyAssignments[someKey] = 'backend-4'; // wrong pin

    const checker = new LBInvariantChecker();
    const violation = checker.check(tampered);
    expect(violation).toBeDefined();
    expect(violation?.ruleId).toBe('LB-3');
    expect(violation?.description).toContain('drifted');
  });

  // ── LB-4: graceful drain & rolling deploy ──

  it('LB-4: draining backend receives zero new connections; in-flight complete; removal deferred', () => {
    const rng = new DeterministicRNG(10);
    let state = createDefaultLBCluster();

    // Open some connections on backend-1.
    for (let i = 0; i < 6; i++) {
      state = ev(state, { id: `r${i}`, tick: 0, type: 'LB_REQUEST', payload: {} }, rng);
    }
    const inflightBefore = state.backends['backend-1']!.inFlight;
    expect(inflightBefore).toBeGreaterThan(0);

    // Start drain at tick 1.
    state = ev(state, { id: 'd', tick: 1, type: 'LB_START_DRAIN', payload: { backendId: 'backend-1' } }, rng);
    expect(state.backends['backend-1']!.health).toBe('DRAINING');

    // Requests during drain never route to backend-1.
    for (let i = 0; i < 20; i++) {
      state = ev(state, { id: `rr${i}`, tick: 2, type: 'LB_REQUEST', payload: {} }, rng);
    }
    for (const log of state.routingLog.slice(-20)) {
      expect(log.backendId).not.toBe('backend-1');
    }

    // Ticks: in-flight connections finish; drain completes; backend returns HEALTHY (replaced).
    const inflightAtDrain = state.backends['backend-1']!.inFlight;
    for (let t = 3; t <= 15; t++) {
      state = ev(state, { id: `t${t}`, tick: t, type: 'LB_TICK', payload: {} }, rng);
    }
    expect(state.backends['backend-1']!.inFlight).toBe(0);
    expect(state.backends['backend-1']!.health).toBe('HEALTHY');
    expect(state.stats.drainCompletions).toBe(1);
    expect(inflightAtDrain).toBeLessThanOrEqual(inflightBefore);

    const checker = new LBInvariantChecker();
    expect(checker.check(state)).toBeUndefined();
  });

  it('LB-4: rolling deploy drains and replaces every backend with zero dropped requests', () => {
    const rng = new DeterministicRNG(11);
    let state = createDefaultLBCluster();

    // Steady traffic during the deploy.
    state = ev(state, { id: 'deploy', tick: 0, type: 'LB_ROLLING_DEPLOY', payload: {} }, rng);
    for (let t = 1; t <= 120; t++) {
      state = ev(state, { id: `t${t}`, tick: t, type: 'LB_TICK', payload: {} }, rng);
      if (t % 2 === 0) {
        state = ev(state, { id: `r${t}`, tick: t, type: 'LB_REQUEST', payload: { sessionKey: `deploy-sess-${t}` } }, rng);
      }
    }

    expect(state.stats.drainCompletions).toBe(4); // all four backends drained & replaced
    expect(state.rollingDeploy.active).toBe(false);
    expect(state.stats.totalDropped).toBe(0); // zero downtime
    for (const log of state.routingLog) {
      expect(log.backendId).not.toBeNull();
    }

    const checker = new LBInvariantChecker();
    expect(checker.check(state)).toBeUndefined();
  });

  it('LB-4: invariant checker catches a new connection opened on a draining backend', () => {
    const rng = new DeterministicRNG(12);
    let state = createDefaultLBCluster();
    state = ev(state, { id: 'r', tick: 0, type: 'LB_REQUEST', payload: {} }, rng);
    state = ev(state, { id: 'd', tick: 5, type: 'LB_START_DRAIN', payload: { backendId: 'backend-1' } }, rng);

    const tampered = JSON.parse(JSON.stringify(state)) as LBClusterState;
    // Simulate a reducer bug: connection starting after drain began.
    const openIds = Object.keys(tampered.connections);
    const conn = tampered.connections[openIds[0] as string]!;
    conn.startTick = 7; // > drainStartTick (5)
    conn.durationTicks = 10;

    const checker = new LBInvariantChecker();
    const violation = checker.check(tampered);
    expect(violation).toBeDefined();
    expect(violation?.ruleId).toBe('LB-4');
    expect(violation?.description).toContain('after');
  });

  it('LB-2: invariant checker catches a skewed weighted distribution', () => {
    const rng = new DeterministicRNG(13);
    let state = createDefaultLBCluster();
    state = ev(state, { id: 'lt', tick: 0, type: 'LB_LOAD_TEST', payload: { count: 2_000 } }, rng);

    const tampered = JSON.parse(JSON.stringify(state)) as LBClusterState;
    // Simulate a routing bug: one backend hoards nearly all traffic.
    tampered.backends['backend-1']!.dispatchCount = 1_997;
    tampered.backends['backend-2']!.dispatchCount = 1;
    tampered.backends['backend-3']!.dispatchCount = 1;
    tampered.backends['backend-4']!.dispatchCount = 1;

    const checker = new LBInvariantChecker();
    const violation = checker.check(tampered);
    expect(violation).toBeDefined();
    expect(violation?.ruleId).toBe('LB-2');
  });

  it('ring lookup binary search agrees with a linear-scan reference', () => {
    const state = createDefaultLBCluster();
    for (let i = 0; i < 300; i++) {
      const key = `probe-${i}`;
      const hash = fnv1a32(`lbsession::${key}`, 0x811c9dc5);
      // Linear scan reference: first vnode with position > hash, wrap to 0.
      let reference: string | null = null;
      for (const vnode of state.ring) {
        if (vnode.position > hash) {
          reference = vnode.backendId;
          break;
        }
      }
      if (reference === null) {
        reference = state.ring[0]!.backendId;
      }
      expect(lbRingLookup(state.ring, key)).toBe(reference);
    }
  });

  it('smooth WRR algorithm: exact ratio over many rounds with weight changes', () => {
    // Unit-level check of the nginx algorithm on isolated backend sets.
    const mk = (id: string, weight: number) => ({
      id, weight, health: 'HEALTHY' as const, crashed: false, inFlight: 0,
      consecutiveFailures: 0, consecutiveSuccesses: 0, responseTimeEwma: 0,
      dispatchCount: 0, drainStartTick: null,
    });
    const eligible = [mk('a', 5), mk('b', 1), mk('c', 1)];
    const current: Record<string, number> = {};
    const counts: Record<string, number> = { a: 0, b: 0, c: 0 };
    for (let i = 0; i < 70; i++) {
      const picked = smoothWeightedRoundRobin(eligible, current);
      expect(picked).not.toBeNull();
      counts[(picked as { id: string }).id]! += 1;
    }
    expect(counts['a']).toBe(50);
    expect(counts['b']).toBe(10);
    expect(counts['c']).toBe(10);

    // Round robin select: pure cycling.
    const rr = roundRobinSelect(eligible, 0);
    expect(rr.backend?.id).toBe('a');
    const rr2 = roundRobinSelect(eligible, 2);
    expect(rr2.backend?.id).toBe('c');
  });

  it('golden determinism: identical event sequences with identical seeds produce identical state', () => {
    const runChaos = () => {
      const rng = new DeterministicRNG(42);
      let state = createDefaultLBCluster();
      state = ev(state, { id: 'p', tick: 0, type: 'LB_SET_POLICY', payload: { policy: 'WEIGHTED_RR' } }, rng);
      state = ev(state, { id: 'w', tick: 0, type: 'LB_SET_WEIGHT', payload: { backendId: 'backend-2', weight: 3 } }, rng);
      for (let i = 0; i < 40; i++) {
        state = ev(state, { id: `r${i}`, tick: i % 10, type: 'LB_REQUEST', payload: { sessionKey: `g-${i % 7}` } }, rng);
        if (i % 5 === 0) {
          state = ev(state, { id: `t${i}`, tick: i % 10, type: 'LB_TICK', payload: {} }, rng);
        }
      }
      state = ev(state, { id: 'k', tick: 9, type: 'LB_KILL_BACKEND', payload: { backendId: 'backend-3' } }, rng);
      for (let t = 10; t <= 25; t++) {
        state = ev(state, { id: `tt${t}`, tick: t, type: 'LB_TICK', payload: {} }, rng);
      }
      state = ev(state, { id: 'd', tick: 26, type: 'LB_START_DRAIN', payload: { backendId: 'backend-4' } }, rng);
      for (let t = 27; t <= 40; t++) {
        state = ev(state, { id: `dt${t}`, tick: t, type: 'LB_TICK', payload: {} }, rng);
      }
      return JSON.stringify(state);
    };
    expect(runChaos()).toBe(runChaos());
  });
});
