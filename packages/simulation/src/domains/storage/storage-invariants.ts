import type { StorageEngineClusterState } from './storage-types.js';

export interface StorageInvariantViolation {
  ruleId: string;
  invariantName: string;
  description: string;
  affectedEntities: string[];
}

export class StorageInvariantChecker {
  public check(state: StorageEngineClusterState): StorageInvariantViolation | undefined {
    // 1. Check B+ Tree node sorted keys
    for (const [nodeId, node] of Object.entries(state.btree.nodes)) {
      for (let i = 0; i < node.keys.length - 1; i++) {
        if (node.keys[i]! >= node.keys[i + 1]!) {
          return {
            ruleId: 'BTREE_KEY_ORDER_VIOLATION',
            invariantName: 'B-Tree Key Sorted Order',
            description: `Node ${nodeId} keys are not strictly ascending: [${node.keys.join(', ')}]`,
            affectedEntities: [nodeId],
          };
        }
      }
    }

    // 2. Check LSM MemTable sorted keys
    for (let i = 0; i < state.lsm.memTable.length - 1; i++) {
      if (state.lsm.memTable[i]!.key > state.lsm.memTable[i + 1]!.key) {
        return {
          ruleId: 'LSM_MEMTABLE_ORDER_VIOLATION',
          invariantName: 'MemTable Key Sorted Order',
          description: `MemTable entries are not ascending by key`,
          affectedEntities: ['memtable'],
        };
      }
    }

    return undefined;
  }
}
