/**
 * ML Feature Store — simulation types.
 *
 * Offline/online feature-store architecture (Feast/Tecton-style):
 * batch-computed offline features, low-latency online serving,
 * point-in-time-correct joins (no training/serving skew, no label
 * leakage), and feature freshness tracking.
 *
 * References:
 * - Feast docs — point-in-time joins, feature freshness
 * - Uber Michelangelo engineering write-up — training/serving skew
 * - Tecton docs — feature freshness/staleness semantics
 */

export interface FeatureDefinition {
  name: string;
  /** monotonically increasing definition version (FS-4) */
  version: number;
  /** description of the computation logic (immutable per version) */
  computation: string;
  /** staleness TTL in ticks for online serving (FS-3) */
  ttlTicks: number;
  /** training set ids that materialized under this definition version */
  materializedIn: string[];
}

export interface OfflineFeatureValue {
  entity: string;
  feature: string;
  value: number;
  /** the event time this value became true (PIT join anchor, FS-1) */
  eventTime: number;
  /** definition version at write time (FS-4) */
  version: number;
}

export interface OnlineValue {
  value: number;
  writeTick: number;
  version: number;
}

export interface TrainingSetRow {
  entity: string;
  feature: string;
  value: number;
  /** eventTime of the source offline value (must be <= labelTimestamp) */
  sourceEventTime: number;
  sourceVersion: number;
}

export interface TrainingSet {
  id: string;
  /** the as-of label timestamp every row was joined against */
  labelTimestamp: number;
  rows: TrainingSetRow[];
  /** definition versions pinned at materialization (FS-4) */
  definitionVersions: Record<string, number>;
}

export interface ServingResult {
  feature: string;
  value: number | null;
  stale: boolean;
  ageTicks: number;
}

export interface FeatureStoreClusterState {
  clusterId: string;
  tick: number;
  rngState?: number;
  definitions: Record<string, FeatureDefinition>;
  featureOrder: string[];
  /** offline history: entity -> feature -> values sorted by eventTime */
  offlineStore: Record<string, Record<string, OfflineFeatureValue[]>>;
  /** online serving store: entity -> feature -> latest value + write tick */
  onlineStore: Record<string, Record<string, OnlineValue>>;
  /** per feature: last tick the offline->online sync ran (FS-2) */
  syncWatermark: Record<string, number>;
  syncInterval: number;
  lastSyncTick: number;
  trainingSets: Record<string, TrainingSet>;
  trainingSetOrder: string[];
  lastServing: { entity: string; results: ServingResult[]; tick: number } | null;
  stats: {
    offlineIngests: number;
    onlineSyncs: number;
    trainingSetJoins: number;
    servingRequests: number;
    staleServes: number;
    definitionEdits: number;
  };
}

export type FeatureStoreSimEvent =
  | { id: string; tick: number; type: 'FS_TICK'; payload: Record<string, unknown> }
  | { id: string; tick: number; type: 'FS_INGEST_OFFLINE'; payload: { entity: string; feature: string; value: number; eventTime: number } }
  | { id: string; tick: number; type: 'FS_SYNC_ONLINE'; payload: Record<string, unknown> }
  | { id: string; tick: number; type: 'FS_JOIN_TRAINING_SET'; payload: { setId: string; labelTimestamp: number } }
  | { id: string; tick: number; type: 'FS_SERVE'; payload: { entity: string; features?: string[] } }
  | { id: string; tick: number; type: 'FS_EDIT_DEFINITION'; payload: { feature: string; computation: string } }
  | { id: string; tick: number; type: 'FS_SET_TTL'; payload: { feature: string; ttlTicks: number } };

/** Resource caps (hard-clamped; surfaced in UI when hit). */
export const FS_CAPS = {
  maxEntities: 50,
  maxFeatures: 10,
  maxOfflineRowsPerEntityFeature: 100,
  maxTrainingSets: 20,
  maxOfflineRows: 5_000,
} as const;
