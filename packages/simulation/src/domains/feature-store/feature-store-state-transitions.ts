import type { DeterministicRNG } from '../../prng/deterministic-rng.js';
import {
  FS_CAPS,
  type FeatureDefinition,
  type FeatureStoreClusterState,
  type FeatureStoreSimEvent,
  type OfflineFeatureValue,
  type ServingResult,
  type TrainingSet,
  type TrainingSetRow,
} from './feature-store-types.js';

const SYNC_INTERVAL = 4;
const DEFAULT_TTL = 10;

const DEFAULT_FEATURES: FeatureDefinition[] = [
  { name: 'user_avg_spend', version: 1, computation: 'avg(transaction_amount) over 30d window', ttlTicks: DEFAULT_TTL, materializedIn: [] },
  { name: 'login_count', version: 1, computation: 'count(login_events) over 7d window', ttlTicks: DEFAULT_TTL, materializedIn: [] },
];

/** Seed offline history for the point-in-time timeline demo. */
const SEED_HISTORY: Array<{ entity: string; feature: string; value: number; eventTime: number }> = [
  { entity: 'user-1', feature: 'user_avg_spend', value: 42, eventTime: 1 },
  { entity: 'user-1', feature: 'user_avg_spend', value: 55, eventTime: 6 },
  { entity: 'user-1', feature: 'user_avg_spend', value: 61, eventTime: 11 },
  { entity: 'user-1', feature: 'user_avg_spend', value: 77, eventTime: 16 },
  { entity: 'user-1', feature: 'login_count', value: 3, eventTime: 2 },
  { entity: 'user-1', feature: 'login_count', value: 7, eventTime: 12 },
  { entity: 'user-2', feature: 'user_avg_spend', value: 10, eventTime: 1 },
  { entity: 'user-2', feature: 'user_avg_spend', value: 18, eventTime: 9 },
  { entity: 'user-2', feature: 'login_count', value: 5, eventTime: 3 },
  { entity: 'user-3', feature: 'user_avg_spend', value: 100, eventTime: 4 },
];

export function createDefaultFeatureStoreCluster(
  clusterId = 'feature-store-1',
): FeatureStoreClusterState {
  const definitions: Record<string, FeatureDefinition> = Object.fromEntries(
    DEFAULT_FEATURES.map((d) => [d.name, { ...d, materializedIn: [] }] as [string, FeatureDefinition]),
  );
  const offlineStore: FeatureStoreClusterState['offlineStore'] = {};
  for (const row of SEED_HISTORY) {
    if (!offlineStore[row.entity]) offlineStore[row.entity] = {};
    if (!offlineStore[row.entity]![row.feature]) offlineStore[row.entity]![row.feature] = [];
    (offlineStore[row.entity]![row.feature] as OfflineFeatureValue[]).push({
      entity: row.entity,
      feature: row.feature,
      value: row.value,
      eventTime: row.eventTime,
      version: 1,
    });
  }
  for (const entity of Object.keys(offlineStore)) {
    for (const feature of Object.keys(offlineStore[entity] as Record<string, OfflineFeatureValue[]>)) {
      (offlineStore[entity]![feature] as OfflineFeatureValue[]).sort((a, b) => a.eventTime - b.eventTime);
    }
  }
  return {
    clusterId,
    tick: 0,
    definitions,
    featureOrder: DEFAULT_FEATURES.map((d) => d.name),
    offlineStore,
    onlineStore: {},
    syncWatermark: Object.fromEntries(DEFAULT_FEATURES.map((d) => [d.name, 0])),
    syncInterval: SYNC_INTERVAL,
    lastSyncTick: 0,
    trainingSets: {},
    trainingSetOrder: [],
    lastServing: null,
    stats: {
      offlineIngests: SEED_HISTORY.length,
      onlineSyncs: 0,
      trainingSetJoins: 0,
      servingRequests: 0,
      staleServes: 0,
      definitionEdits: 0,
    },
  };
}

/**
 * Point-in-time lookup (FS-1): latest offline value with
 * eventTime <= asOf. Pure.
 */
export function pointInTimeLookup(
  state: Pick<FeatureStoreClusterState, 'offlineStore'>,
  entity: string,
  feature: string,
  asOf: number,
): OfflineFeatureValue | null {
  const history = state.offlineStore[entity]?.[feature];
  if (!history || history.length === 0) return null;
  let best: OfflineFeatureValue | null = null;
  for (const value of history) {
    if (value.eventTime <= asOf) {
      best = value;
    } else {
      break; // sorted by eventTime
    }
  }
  return best;
}

function syncOnline(state: FeatureStoreClusterState): void {
  for (const entity of Object.keys(state.offlineStore)) {
    for (const feature of Object.keys(state.offlineStore[entity] as Record<string, OfflineFeatureValue[]>)) {
      // Sync the point-in-time value as of the CURRENT tick (FS-2:
      // online equals offline as of the watermark).
      const pit = pointInTimeLookup(state, entity, feature, state.tick);
      if (!pit) continue;
      if (!state.onlineStore[entity]) state.onlineStore[entity] = {};
      (state.onlineStore[entity] as Record<string, { value: number; writeTick: number; version: number }>)[feature] = {
        value: pit.value,
        writeTick: state.tick,
        version: pit.version,
      };
    }
  }
  for (const feature of state.featureOrder) {
    state.syncWatermark[feature] = state.tick;
  }
  state.lastSyncTick = state.tick;
  state.stats.onlineSyncs++;
}

export function pureFeatureStoreTransition(
  state: FeatureStoreClusterState,
  event: FeatureStoreSimEvent,
  rng: DeterministicRNG,
): { nextState: FeatureStoreClusterState; emittedEvents: FeatureStoreSimEvent[] } {
  const nextState: FeatureStoreClusterState = JSON.parse(
    JSON.stringify(state),
  ) as FeatureStoreClusterState;
  nextState.tick = event.tick;

  switch (event.type) {
    case 'FS_INGEST_OFFLINE': {
      const { entity, feature, value, eventTime } = event.payload;
      if (!nextState.definitions[feature]) break;
      if (Object.keys(nextState.offlineStore).length >= FS_CAPS.maxEntities) break;
      if (!nextState.offlineStore[entity]) nextState.offlineStore[entity] = {};
      const history = nextState.offlineStore[entity]![feature] ?? [];
      if (history.length >= FS_CAPS.maxOfflineRowsPerEntityFeature) break;

      const version = nextState.definitions[feature]!.version;
      const entry: OfflineFeatureValue = { entity, feature, value, eventTime, version };
      // Insert maintaining eventTime sort order (PIT correctness).
      let insertAt = history.length;
      for (let i = 0; i < history.length; i++) {
        if ((history[i] as OfflineFeatureValue).eventTime > eventTime) {
          insertAt = i;
          break;
        }
      }
      history.splice(insertAt, 0, entry);
      nextState.offlineStore[entity]![feature] = history;
      nextState.stats.offlineIngests++;
      void rng.nextFloat();
      break;
    }

    case 'FS_SYNC_ONLINE': {
      syncOnline(nextState);
      break;
    }

    case 'FS_JOIN_TRAINING_SET': {
      const { setId, labelTimestamp } = event.payload;
      if (nextState.trainingSets[setId] !== undefined) break;
      if (Object.keys(nextState.trainingSets).length >= FS_CAPS.maxTrainingSets) break;

      const rows: TrainingSetRow[] = [];
      for (const entity of Object.keys(nextState.offlineStore)) {
        for (const feature of nextState.featureOrder) {
          const pit = pointInTimeLookup(nextState, entity, feature, labelTimestamp);
          if (!pit) continue;
          rows.push({
            entity,
            feature,
            value: pit.value,
            sourceEventTime: pit.eventTime,
            sourceVersion: pit.version,
          });
        }
      }
      rows.sort((a, b) => a.entity.localeCompare(b.entity) || a.feature.localeCompare(b.feature));

      // FS-4: pin the definition versions this set materialized under.
      const definitionVersions: Record<string, number> = {};
      for (const feature of nextState.featureOrder) {
        if (rows.some((r) => r.feature === feature)) {
          definitionVersions[feature] = nextState.definitions[feature]!.version;
          nextState.definitions[feature]!.materializedIn.push(setId);
        }
      }

      const set: TrainingSet = { id: setId, labelTimestamp, rows, definitionVersions };
      nextState.trainingSets[setId] = set;
      nextState.trainingSetOrder.push(setId);
      nextState.stats.trainingSetJoins++;
      void rng.nextFloat();
      break;
    }

    case 'FS_SERVE': {
      const entity = event.payload.entity;
      const features = event.payload.features ?? nextState.featureOrder;
      const results: ServingResult[] = [];
      for (const feature of features) {
        const definition = nextState.definitions[feature];
        const online = nextState.onlineStore[entity]?.[feature];
        if (!definition || !online) {
          results.push({ feature, value: null, stale: true, ageTicks: Infinity });
          continue;
        }
        const ageTicks = nextState.tick - online.writeTick;
        // FS-3: past the TTL the value is served with stale: true —
        // never silently as current.
        const stale = ageTicks > definition.ttlTicks;
        if (stale) {
          nextState.stats.staleServes++;
        }
        results.push({ feature, value: online.value, stale, ageTicks });
      }
      nextState.lastServing = { entity, results, tick: nextState.tick };
      nextState.stats.servingRequests++;
      void rng.nextFloat();
      break;
    }

    case 'FS_EDIT_DEFINITION': {
      const feature = event.payload.feature;
      const definition = nextState.definitions[feature];
      if (!definition) break;
      // FS-4: definitions are versioned, never mutated in place —
      // materialized sets keep resolving to their pinned version.
      definition.version += 1;
      definition.computation = event.payload.computation;
      definition.materializedIn = [];
      nextState.stats.definitionEdits++;
      break;
    }

    case 'FS_SET_TTL': {
      const definition = nextState.definitions[event.payload.feature];
      if (definition) {
        definition.ttlTicks = Math.max(1, Math.min(100, event.payload.ttlTicks));
      }
      break;
    }

    case 'TICK' as any:
    case 'FS_TICK': {
      // Periodic offline->online sync (the sync lag demo window).
      if (nextState.tick - nextState.lastSyncTick >= nextState.syncInterval) {
        syncOnline(nextState);
      }
      void rng.nextFloat();
      break;
    }
  }

  nextState.rngState = rng.getState();
  return { nextState, emittedEvents: [] };
}
