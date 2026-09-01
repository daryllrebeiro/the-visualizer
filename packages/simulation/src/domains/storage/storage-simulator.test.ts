import { describe, expect, it } from 'vitest';
import { DeterministicRNG } from '../../prng/deterministic-rng.js';
import { createInitialBTree, insertBTree, searchBTree } from './btree.js';
import { createInitialLSMTree, readLSM, writeLSM } from './lsm-tree.js';
import { StorageInvariantChecker } from './storage-invariants.js';
import {
  createDefaultStorageCluster,
  pureStorageTransition,
} from './storage-state-transitions.js';
import type { StorageSimEvent } from './storage-types.js';

describe('Storage Engine Domain Simulation (B+ Tree vs. LSM-Tree)', () => {
  it('should split B+ Tree node when capacity exceeds degree', () => {
    const tree = createInitialBTree(4);
    expect(tree.nodes[tree.rootId]?.keys.length).toBe(3);

    // Inserting 25 causes overflow split
    insertBTree(tree, 25, 'val_25');

    expect(tree.totalPageSplits).toBe(1);
    expect(Object.keys(tree.nodes).length).toBe(3); // 1 root + 2 leaves

    const lookup = searchBTree(tree, 25);
    expect(lookup.value).toBe('val_25');
    expect(lookup.path.length).toBeGreaterThan(1);
  });

  it('should flush LSM MemTable to Level 0 SSTable with Bloom filter when capacity is exceeded', () => {
    const lsm = createInitialLSMTree(4);
    expect(lsm.memTable.length).toBe(2);

    writeLSM(lsm, 30, 'val_30', 1);
    writeLSM(lsm, 40, 'val_40', 2); // Hits capacity 4 -> auto-flush

    expect(lsm.totalFlushes).toBe(1);
    expect(lsm.memTable.length).toBe(0);
    expect(lsm.levels['0']?.length).toBe(1);

    const sstable = lsm.levels['0']![0]!;
    expect(sstable.entries.length).toBe(4);
    expect(sstable.bloomFilterBitset.length).toBe(16);

    const readResult = readLSM(lsm, 30);
    expect(readResult.value).toBe('val_30');
    expect(readResult.inMemTable).toBe(false);
  });

  it('should transition storage cluster state deterministically for writes and reads', () => {
    const rng = new DeterministicRNG(42);
    let state = createDefaultStorageCluster();
    const checker = new StorageInvariantChecker();

    expect(checker.check(state)).toBeUndefined();

    const writeEv: StorageSimEvent = {
      id: 'write-1',
      tick: 1,
      type: 'STORAGE_WRITE',
      payload: { key: 50, value: 'val_50' },
    };

    const res = pureStorageTransition(state, writeEv, rng);
    expect(res.nextState.totalWrites).toBe(1);
    expect(checker.check(res.nextState)).toBeUndefined();
  });
});
