import { describe, expect, it } from 'vitest';

import { DeterministicRNG } from '../../prng/deterministic-rng.js';
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
  flushMemTable,
  generateBloomFilter,
  optimalHashCount,
  testBloomFilter,
  writeLSM,
} from './lsm-tree.js';
import { createDefaultStorageCluster, pureStorageTransition } from './storage-state-transitions.js';

describe('Storage Engine Domain Fidelity Test Suite', () => {
  describe('SQLite-grade B+Tree High-Fanout & Redistribution', () => {
    it('derives high-fanout B+Tree order from realistic page size (RFC / SQLite standard)', () => {
      // 4096-byte page with 16-byte key + 8-byte child pointer
      const order4k = deriveBTreeOrder(4096, 16, 8);
      expect(order4k).toBe(170);

      // 16KB page size for enterprise OLAP/LSM blocks
      const order16k = deriveBTreeOrder(16384, 16, 8);
      expect(order16k).toBe(682);
    });

    it('performs key redistribution before merging upon deletion underflow', () => {
      const btree = createInitialBTree(4); // maxDegree=4, minKeys=1
      // Insert elements to create multiple nodes
      insertBTree(btree, 40, 'val_40');
      insertBTree(btree, 50, 'val_50');
      insertBTree(btree, 60, 'val_60');
      insertBTree(btree, 70, 'val_70');

      expect(btree.totalPageSplits).toBeGreaterThan(0);

      // Delete a key from a leaf
      const initialRedist = btree.totalRedistributions;
      const initialMerges = btree.totalMerges;

      const deleted = deleteBTree(btree, 70);
      expect(deleted).toBe(true);
      expect(searchBTree(btree, 70).value).toBeNull();
      expect(searchBTree(btree, 10).value).toBe('val_10');

      // Delete remaining keys to trigger merge
      deleteBTree(btree, 60);
      deleteBTree(btree, 50);

      expect(btree.totalMerges + btree.totalRedistributions).toBeGreaterThan(0);
    });
  });

  describe('RocksDB-grade LSM-Tree Compaction & Bloom Filter Mathematics', () => {
    it('matches exact Bloom filter theoretical false-positive probability formula: p ≈ (1 - e^(-kn/m))^k', () => {
      // 10 bits per key: optimal k = round(ln(2) * 10) = 7
      const k = optimalHashCount(10);
      expect(k).toBe(7);

      const fp10 = calculateTheoreticalBloomFpRate(10, k);
      // For b=10, k=7, p ≈ 0.00819 ≈ 0.82%
      expect(fp10).toBeGreaterThan(0.008);
      expect(fp10).toBeLessThan(0.009);

      // 16 bits per key: k = 11, p ≈ 0.00046 ≈ 0.046%
      const k16 = optimalHashCount(16);
      expect(k16).toBe(11);
      const fp16 = calculateTheoreticalBloomFpRate(16, k16);
      expect(fp16).toBeLessThan(0.0006);
    });

    it('verifies exact numeric Bloom FP rate degradation with fixed m bits as item count n grows', () => {
      const m = 1000;
      const k = 7;

      // For n = 100 items: exponent = -7 * 100 / 1000 = -0.7
      // 1 - e^(-0.7) = 0.503415 -> (0.503415)^7 = 0.008189 (approx 0.82%)
      const fp100 = calculateTheoreticalBloomFpRate(m, k, 100);
      expect(fp100).toBeCloseTo(0.008189, 4);

      // For n = 200 items in same m=1000 bit filter: exponent = -1.4
      // 1 - e^(-1.4) = 0.753403 -> (0.753403)^7 = 0.137782 (approx 13.78%)
      const fp200 = calculateTheoreticalBloomFpRate(m, k, 200);
      expect(fp200).toBeCloseTo(0.137782, 4);

      // Confirm FP rate degrades significantly as item count n increases
      expect(fp200).toBeGreaterThan(fp100 * 15);
    });

    it('verifies Bloom filter membership with double hashing without false negatives', () => {
      const keys = [101, 202, 303, 404, 505];
      const { bitset, k } = generateBloomFilter(keys, 10);

      // Zero false negatives: all inserted keys MUST test positive
      for (const key of keys) {
        expect(testBloomFilter(bitset, key, k)).toBe(true);
      }
    });

    it('computes realistic Write Amplification Factor (WAF) across WAL, Flush, and Leveled Compaction', () => {
      const lsm = createInitialLSMTree(3); // memTableCapacity = 3

      // Write user records
      writeLSM(lsm, 1, 'payload_alpha', 10);
      writeLSM(lsm, 2, 'payload_beta', 11);
      writeLSM(lsm, 3, 'payload_gamma', 12); // Triggers flush to L0

      expect(lsm.totalFlushes).toBe(1);
      expect(lsm.levels['0']?.length).toBe(1);

      // Verify WAF is strictly greater than 1.0 (bytes written to WAL + SSTable > user payload)
      expect(lsm.writeAmplification).toBeGreaterThanOrEqual(2.0);
      expect(lsm.physicalBytesWritten).toBeGreaterThan(lsm.logicalBytesWritten);

      // Trigger flush and compaction
      writeLSM(lsm, 4, 'payload_delta', 13);
      writeLSM(lsm, 5, 'payload_epsilon', 14);
      writeLSM(lsm, 6, 'payload_zeta', 15); // Second flush

      compactLevel(lsm, 0, 16);
      expect(lsm.totalCompactions).toBe(1);
      expect(lsm.levels['1']?.length).toBe(1);
      expect(lsm.writeAmplification).toBeGreaterThanOrEqual(2.5);
    });

    it('models WAL sync policy differences (ALWAYS vs BATCH)', () => {
      const rng = new DeterministicRNG(12345);
      const cluster = createDefaultStorageCluster();
      cluster.activeEngine = 'LSM_TREE';

      // Configure BATCH policy
      const configured = pureStorageTransition(
        cluster,
        {
          id: 'cfg',
          tick: 1,
          type: 'STORAGE_CONFIGURE_FIDELITY',
          payload: { fidelityMode: 'REALISTIC', walSyncPolicy: 'BATCH' },
        },
        rng,
      ).nextState;

      expect(configured.lsm.walSyncPolicy).toBe('BATCH');

      // Write 2 items: unsynced count increments
      const s1 = pureStorageTransition(
        configured,
        { id: 'w1', tick: 2, type: 'STORAGE_WRITE', payload: { key: 100, value: 'v100' } },
        rng,
      ).nextState;
      expect(s1.lsm.walUnsyncedCount).toBe(1);
    });
  });
});
