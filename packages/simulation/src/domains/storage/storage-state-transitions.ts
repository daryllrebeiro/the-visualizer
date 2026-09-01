import { DeterministicRNG } from '../../prng/deterministic-rng.js';
import { createInitialBTree, insertBTree, searchBTree } from './btree.js';
import {
  compactLevel,
  createInitialLSMTree,
  flushMemTable,
  readLSM,
  writeLSM,
} from './lsm-tree.js';
import type {
  StorageEngineClusterState,
  StorageEngineType,
  StorageSimEvent,
} from './storage-types.js';

export interface StorageTransitionResult {
  nextState: StorageEngineClusterState;
  emittedEvents: StorageSimEvent[];
}

export function createDefaultStorageCluster(clusterId = 'storage-cluster-1'): StorageEngineClusterState {
  return {
    clusterId,
    tick: 0,
    rngState: 42,
    activeEngine: 'B_TREE',
    btree: createInitialBTree(4),
    lsm: createInitialLSMTree(4),
    totalWrites: 0,
    totalReads: 0,
  };
}

export function pureStorageTransition(
  state: StorageEngineClusterState,
  event: StorageSimEvent,
  rng: DeterministicRNG,
): StorageTransitionResult {
  const nextState: StorageEngineClusterState = JSON.parse(JSON.stringify(state)) as StorageEngineClusterState;
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
  }

  nextState.rngState = rng.getState();
  return { nextState, emittedEvents };
}
