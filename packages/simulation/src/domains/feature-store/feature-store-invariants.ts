import { pointInTimeLookup } from './feature-store-state-transitions.js';
import type { FeatureStoreClusterState } from './feature-store-types.js';

export interface FeatureStoreInvariantViolation {
  ruleId: 'FS-1' | 'FS-2' | 'FS-3' | 'FS-4';
  invariantName: string;
  description: string;
  affectedEntities: string[];
}

/**
 * State-level checks for the feature-store domain.
 *
 * FS-1: every materialized training row equals the recomputed
 * point-in-time value at its set's label timestamp (eventTime <= T).
 * FS-2: online values equal the offline point-in-time value as of each
 * feature's sync watermark.
 * FS-3: every recorded serving result older than the TTL is flagged
 * stale (never silently fresh).
 * FS-4: training sets resolve against their pinned definition versions;
 * no materialized row references a version younger than the set.
 */
export class FeatureStoreInvariantChecker {
  public check(state: FeatureStoreClusterState): FeatureStoreInvariantViolation | undefined {
    // FS-1: point-in-time correctness of materialized rows.
    for (const set of Object.values(state.trainingSets)) {
      for (const row of set.rows) {
        const pit = pointInTimeLookup(state, row.entity, row.feature, set.labelTimestamp);
        if (!pit) {
          return {
            ruleId: 'FS-1',
            invariantName: 'Point-in-Time Correctness',
            description: `Training set ${set.id} row (${row.entity}, ${row.feature}) has no offline value at or before label timestamp ${set.labelTimestamp}`,
            affectedEntities: [set.id, row.entity, row.feature],
          };
        }
        if (row.value !== pit.value) {
          return {
            ruleId: 'FS-1',
            invariantName: 'Point-in-Time Correctness',
            description: `Training set ${set.id} row (${row.entity}, ${row.feature}) joined value ${row.value} but the point-in-time value at T=${set.labelTimestamp} is ${pit.value} (eventTime ${pit.eventTime}) — future data leaked into a training example`,
            affectedEntities: [set.id, row.entity, row.feature],
          };
        }
        if (row.sourceEventTime > set.labelTimestamp) {
          return {
            ruleId: 'FS-1',
            invariantName: 'Point-in-Time Correctness',
            description: `Training set ${set.id} row (${row.entity}, ${row.feature}) sourced eventTime ${row.sourceEventTime} > label timestamp ${set.labelTimestamp} — label leakage`,
            affectedEntities: [set.id, row.entity, row.feature],
          };
        }
      }
    }

    // FS-2: online/offline consistency at the sync watermark.
    for (const [entity, features] of Object.entries(state.onlineStore)) {
      for (const [feature, online] of Object.entries(features)) {
        const watermark = state.syncWatermark[feature] ?? 0;
        const pit = pointInTimeLookup(state, entity, feature, watermark);
        if (pit && online.value !== pit.value) {
          return {
            ruleId: 'FS-2',
            invariantName: 'Online/Offline Consistency',
            description: `Online value for (${entity}, ${feature}) is ${online.value} but the offline point-in-time value at watermark ${watermark} is ${pit.value} — training/serving skew`,
            affectedEntities: [entity, feature],
          };
        }
        if (pit && online.version !== pit.version) {
          return {
            ruleId: 'FS-2',
            invariantName: 'Online/Offline Consistency',
            description: `Online version for (${entity}, ${feature}) is ${online.version} but offline has ${pit.version} at watermark ${watermark}`,
            affectedEntities: [entity, feature],
          };
        }
      }
    }

    // FS-3: staleness flags on the last serving request.
    if (state.lastServing) {
      for (const result of state.lastServing.results) {
        const definition = state.definitions[result.feature];
        if (!definition) continue;
        if (result.value !== null && result.ageTicks > definition.ttlTicks && !result.stale) {
          return {
            ruleId: 'FS-3',
            invariantName: 'Freshness Bound',
            description: `Serving result for (${state.lastServing.entity}, ${result.feature}) is ${result.ageTicks} ticks old (TTL ${definition.ttlTicks}) but was not flagged stale — served silently as current`,
            affectedEntities: [state.lastServing.entity, result.feature],
          };
        }
        if (result.value !== null && result.ageTicks <= definition.ttlTicks && result.stale) {
          return {
            ruleId: 'FS-3',
            invariantName: 'Freshness Bound',
            description: `Serving result for (${state.lastServing.entity}, ${result.feature}) is fresh (${result.ageTicks} <= TTL ${definition.ttlTicks}) but was wrongly flagged stale`,
            affectedEntities: [state.lastServing.entity, result.feature],
          };
        }
      }
    }

    // FS-4: definition immutability for materialized sets.
    for (const set of Object.values(state.trainingSets)) {
      for (const [feature, pinnedVersion] of Object.entries(set.definitionVersions)) {
        const current = state.definitions[feature];
        if (!current) {
          return {
            ruleId: 'FS-4',
            invariantName: 'Feature Definition Immutability',
            description: `Training set ${set.id} pins feature ${feature} whose definition no longer exists`,
            affectedEntities: [set.id, feature],
          };
        }
        if (pinnedVersion > current.version) {
          return {
            ruleId: 'FS-4',
            invariantName: 'Feature Definition Immutability',
            description: `Training set ${set.id} pins ${feature} v${pinnedVersion} but the current definition is v${current.version} — a materialized set references a future definition`,
            affectedEntities: [set.id, feature],
          };
        }
        // Rows must carry the version pinned at materialization time.
        for (const row of set.rows) {
          if (row.feature === feature && row.sourceVersion !== undefined && row.sourceVersion > pinnedVersion) {
            return {
              ruleId: 'FS-4',
              invariantName: 'Feature Definition Immutability',
              description: `Training set ${set.id} row (${row.entity}, ${feature}) carries version ${row.sourceVersion} > pinned v${pinnedVersion} — a later definition leaked into a materialized set`,
              affectedEntities: [set.id, row.entity, row.feature],
            };
          }
        }
      }
    }

    return undefined;
  }
}
