import { describe, expect, it } from 'vitest';
import { DeterministicRNG } from '../../prng/deterministic-rng.js';
import { extractHashTag, getClusterSlot } from './crc16.js';
import { evictUntilMemoryAvailable } from './redis-eviction.js';
import {
  createDefaultRedisCluster,
  pureRedisTransition,
} from './redis-state-transitions.js';
import type { RedisNode, RedisSimEvent } from './redis-types.js';

describe('Redis Cluster Domain Fidelity Test Suite (Redis 7.2+ Cluster Spec)', () => {
  describe('CRC16-CCITT & Hash Tag Multi-Key Colocation', () => {
    it('extracts hashtags correctly and routes co-tagged keys to identical hash slots', () => {
      const tag1 = extractHashTag('{user:42}:profile');
      const tag2 = extractHashTag('{user:42}:orders');
      expect(tag1).toBe('user:42');
      expect(tag2).toBe('user:42');

      const slot1 = getClusterSlot('{user:42}:profile');
      const slot2 = getClusterSlot('{user:42}:orders');
      expect(slot1).toBe(slot2);

      // Without hashtag, distinct keys map to different slots
      const slotA = getClusterSlot('user:42:profile');
      const slotB = getClusterSlot('user:42:orders');
      expect(slotA).not.toBe(slotB);
    });
  });

  describe('MOVED vs. ASK Redirection Semantics', () => {
    it('permanently updates client route cache on MOVED redirection', () => {
      const rng = new DeterministicRNG(42);
      const cluster = createDefaultRedisCluster();

      // Send key 'alpha' to node 2, but slot belongs to node 1
      const slot = getClusterSlot('alpha');
      const setEv: RedisSimEvent = {
        id: 'set-moved',
        tick: 1,
        type: 'REDIS_SET',
        payload: {
          key: 'alpha',
          value: 'val_alpha',
          clientTargetNodeId: '2', // Wrong node
        },
      };

      const result = pureRedisTransition(cluster, setEv, rng);
      expect(result.nextState.totalMovedRedirects).toBe(1);

      // Client slot cache must have been updated to target master
      expect(result.nextState.clientSlotCache[slot]).toBe('1');
    });

    it('does NOT update client route cache on ASK redirection during resharding', () => {
      const rng = new DeterministicRNG(42);
      const cluster = createDefaultRedisCluster();

      const slot = getClusterSlot('beta');
      // Mark slot as migrating on node 1
      cluster.nodes['1']!.migratingSlots.push(slot);

      const setEv: RedisSimEvent = {
        id: 'set-ask',
        tick: 1,
        type: 'REDIS_SET',
        payload: {
          key: 'beta',
          value: 'val_beta',
          clientTargetNodeId: '1', // Contacted node migrating slot
        },
      };

      const result = pureRedisTransition(cluster, setEv, rng);
      expect(result.nextState.totalAskRedirects).toBe(1);

      // ASK redirection must NOT update client slot cache
      expect(result.nextState.clientSlotCache[slot]).toBeUndefined();
    });
  });

  describe('Approximate LRU/LFU Eviction (redis.conf maxmemory-samples)', () => {
    it('samples N candidate keys instead of global scan and evicts oldest from sample', () => {
      const rng = new DeterministicRNG(12345);
      const node: RedisNode = {
        id: 'test-node',
        host: '127.0.0.1',
        port: 6379,
        clusterBusPort: 16379,
        configEpoch: 1,
        role: 'MASTER',
        masterId: null,
        status: 'ALIVE',
        slotRanges: [],
        migratingSlots: [],
        importingSlots: [],
        memoryUsedBytes: 500,
        maxMemoryBytes: 500, // Full memory
        storage: {
          k1: { key: 'k1', value: 'v1', ttl: null, lastAccessedTick: 10, accessCount: 1, sizeBytes: 100 },
          k2: { key: 'k2', value: 'v2', ttl: null, lastAccessedTick: 20, accessCount: 1, sizeBytes: 100 },
          k3: { key: 'k3', value: 'v3', ttl: null, lastAccessedTick: 30, accessCount: 1, sizeBytes: 100 },
          k4: { key: 'k4', value: 'v4', ttl: null, lastAccessedTick: 40, accessCount: 1, sizeBytes: 100 },
          k5: { key: 'k5', value: 'v5', ttl: null, lastAccessedTick: 50, accessCount: 1, sizeBytes: 100 },
        },
        color: '#fff',
      };

      // Evict with sample size 3
      const res = evictUntilMemoryAvailable(node, 100, 'allkeys-lru', rng, 3);
      expect(res.success).toBe(true);
      expect(res.evictedKeys.length).toBe(1);
      expect(node.memoryUsedBytes).toBe(400);
    });

    it('enforces volatile-lru only evicting keys that have an explicit TTL', () => {
      const rng = new DeterministicRNG(999);
      const node: RedisNode = {
        id: 'test-node-volatile',
        host: '127.0.0.1',
        port: 6379,
        clusterBusPort: 16379,
        configEpoch: 1,
        role: 'MASTER',
        masterId: null,
        status: 'ALIVE',
        slotRanges: [],
        migratingSlots: [],
        importingSlots: [],
        memoryUsedBytes: 400,
        maxMemoryBytes: 400,
        storage: {
          perm1: { key: 'perm1', value: 'p1', ttl: null, lastAccessedTick: 1, accessCount: 1, sizeBytes: 200 },
          vol1: { key: 'vol1', value: 'v1', ttl: 60, lastAccessedTick: 5, accessCount: 1, sizeBytes: 200 },
        },
        color: '#fff',
      };

      const res = evictUntilMemoryAvailable(node, 100, 'volatile-lru', rng, 5);
      expect(res.success).toBe(true);
      // Must evict vol1, never perm1
      expect(res.evictedKeys).toContain('vol1');
      expect(node.storage['perm1']).toBeDefined();
    });
  });

  describe('Cluster Bus & Epoch-based Failover', () => {
    it('provisions cluster bus port at port + 10000 and increments configEpoch on failover', () => {
      const rng = new DeterministicRNG(42);
      const cluster = createDefaultRedisCluster();

      expect(cluster.nodes['1']!.clusterBusPort).toBe(17000);
      expect(cluster.nodes['2']!.clusterBusPort).toBe(17001);

      // Trigger failover of Master 1
      const failoverEv: RedisSimEvent = {
        id: 'failover-1',
        tick: 1,
        type: 'REDIS_FAILOVER',
        payload: { masterId: '1' },
      };

      const result = pureRedisTransition(cluster, failoverEv, rng);
      expect(result.nextState.currentEpoch).toBe(2);

      // Replica 4 was promoted to Master
      const promoted = result.nextState.nodes['4']!;
      expect(promoted.role).toBe('MASTER');
      expect(promoted.configEpoch).toBe(2);
      expect(promoted.slotRanges).toEqual(cluster.nodes['1']!.slotRanges);
    });
  });
});
