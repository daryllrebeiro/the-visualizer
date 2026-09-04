import type { DeterministicRNG } from '../../prng/deterministic-rng.js';
import {
  createInitialBTree,
  deleteBTree,
  deriveBTreeOrder,
  insertBTree,
  searchBTree,
} from './btree.js';
import {
  calculateTheoreticalBloomFpRate,
  compactLevel,
  createInitialLSMTree,
  deleteLSM,
  flushMemTable,
  optimalHashCount,
  readLSM,
  writeLSM,
} from './lsm-tree.js';
import type {
  StorageEngineClusterState,
  StorageEngineType,
  StorageSimEvent,
  WALSyncPolicy,
} from './storage-types.js';

export interface StorageTransitionResult {
  nextState: StorageEngineClusterState;
  emittedEvents: StorageSimEvent[];
}

export function createDefaultStorageCluster(
  clusterId = 'storage-cluster-1',
): StorageEngineClusterState {
  return {
    clusterId,
    tick: 0,
    rngState: 42,
    activeEngine: 'B_TREE',
    fidelityMode: 'TEXTBOOK',
    btree: createInitialBTree(4, 4096, 16, 8),
    lsm: createInitialLSMTree(4, 10, 'ALWAYS', 10),
    totalWrites: 0,
    totalReads: 0,
  };
}

export function pureStorageTransition(
  state: StorageEngineClusterState,
  event: StorageSimEvent,
  rng: DeterministicRNG,
): StorageTransitionResult {
  const nextState: StorageEngineClusterState = JSON.parse(
    JSON.stringify(state),
  ) as StorageEngineClusterState;
  const emittedEvents: StorageSimEvent[] = [];

  nextState.tick = event.tick;

  switch (event.type) {
    case 'STORAGE_WRITE': {
      const key = Number(event.payload['key']);
      const value = String(event.payload['value'] ?? `val_${String(key)}`);
      nextState.totalWrites++;

      if (nextState.activeEngine === 'B_TREE') {
        insertBTree(nextState.btree, key, value);
      } else {
        writeLSM(nextState.lsm, key, value, nextState.tick);
      }
      break;
    }

    case 'STORAGE_DELETE': {
      const key = Number(event.payload['key']);
      if (nextState.activeEngine === 'B_TREE') {
        deleteBTree(nextState.btree, key);
      } else {
        deleteLSM(nextState.lsm, key, nextState.tick);
      }
      break;
    }

    case 'STORAGE_READ': {
      const key = Number(event.payload['key']);
      nextState.totalReads++;

      if (nextState.activeEngine === 'B_TREE') {
        searchBTree(nextState.btree, key);
      } else {
        readLSM(nextState.lsm, key);
      }
      break;
    }

    case 'STORAGE_SWITCH_ENGINE': {
      const engine = String(event.payload['engine']) as StorageEngineType;
      if (engine === 'B_TREE' || engine === 'LSM_TREE') {
        nextState.activeEngine = engine;
      }
      break;
    }

    case 'STORAGE_TRIGGER_FLUSH': {
      flushMemTable(nextState.lsm, nextState.tick);
      break;
    }

    case 'STORAGE_TRIGGER_COMPACTION': {
      const level = Number(event.payload['level'] ?? 0);
      compactLevel(nextState.lsm, level, nextState.tick);
      break;
    }

    case 'STORAGE_CONFIGURE_FIDELITY': {
      const mode = event.payload['fidelityMode'] as 'TEXTBOOK' | 'REALISTIC';
      if (mode) nextState.fidelityMode = mode;

      if (mode === 'REALISTIC') {
        const pageSize = Number(event.payload['pageSizeBytes'] ?? 4096);
        nextState.btree.pageSizeBytes = pageSize;
        nextState.btree.maxDegree = deriveBTreeOrder(
          pageSize,
          nextState.btree.keySizeBytes,
          nextState.btree.pointerSizeBytes,
        );

        const bitsPerKey = Number(event.payload['bitsPerKey'] ?? 10);
        nextState.lsm.bitsPerKey = bitsPerKey;
        nextState.lsm.hashCount = optimalHashCount(bitsPerKey);
        nextState.lsm.theoreticalFpRate = calculateTheoreticalBloomFpRate(
          bitsPerKey,
          nextState.lsm.hashCount,
        );

        const walPolicy = event.payload['walSyncPolicy'] as WALSyncPolicy;
        if (walPolicy) nextState.lsm.walSyncPolicy = walPolicy;
      } else if (mode === 'TEXTBOOK') {
        nextState.btree.maxDegree = 4;
      }
      break;
    }
  }

  nextState.rngState = rng.getState();
  return { nextState, emittedEvents };
}
