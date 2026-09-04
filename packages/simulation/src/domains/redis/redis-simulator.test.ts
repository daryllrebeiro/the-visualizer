import { describe, expect, it } from 'vitest';

import { DeterministicRNG } from '../../prng/deterministic-rng.js';
import { extractHashTag, getClusterSlot } from './crc16.js';
import { RedisInvariantChecker } from './redis-invariants.js';
import { createDefaultRedisCluster, pureRedisTransition } from './redis-state-transitions.js';
import type { RedisNode, RedisSimEvent } from './redis-types.js';

describe('Redis Cluster Simulation (16,384 Slots & Eviction Engine)', () => {
  it('should compute cluster slots and parse hashtags accurately', () => {
    expect(extractHashTag('{user:100}:profile')).toBe('user:100');
    expect(extractHashTag('{user:100}:orders')).toBe('user:100');
    expect(extractHashTag('simple_key')).toBe('simple_key');

    const slot1 = getClusterSlot('{user:100}:profile');
    const slot2 = getClusterSlot('{user:100}:orders');
    expect(slot1).toBe(slot2);
    expect(slot1).toBeGreaterThanOrEqual(0);
    expect(slot1).toBeLessThan(16384);
  });

  it('should initialize cluster with 3 Master/Replica pairs covering all 16,384 slots', () => {
    const cluster = createDefaultRedisCluster();
    const checker = new RedisInvariantChecker();

    expect(Object.keys(cluster.nodes).length).toBe(6);
    expect(checker.check(cluster)).toBeUndefined();
  });

  it('should handle MOVED redirection when client hits wrong node', () => {
    const rng = new DeterministicRNG(42);
    const cluster = createDefaultRedisCluster();

    // Key that hashes to slot > 5460 (e.g. Master 2 or 3)
    const slot = getClusterSlot('product:999');

    const setEv: RedisSimEvent = {
      id: 'set-1',
      tick: 1,
      type: 'REDIS_SET',
      payload: {
        key: 'product:999',
        value: 'shoes',
        clientTargetNodeId: slot > 5460 ? '1' : '2', // Target wrong node intentionally
      },
    };

    const res = pureRedisTransition(cluster, setEv, rng);
    expect(res.emittedEvents.length).toBe(1);
    expect(res.emittedEvents[0]?.type).toBe('REDIS_MOVED_REDIRECT');
    expect(res.nextState.totalMovedRedirects).toBe(1);
  });

  it('should evict least recently used keys under allkeys-lru policy when memory is full', () => {
    const rng = new DeterministicRNG(42);
    let state = createDefaultRedisCluster();
    state.evictionPolicy = 'allkeys-lru';

    // Node 1 capacity is 512 bytes (8 entries at 64B each)
    const node1 = state.nodes['1']!;
    node1.maxMemoryBytes = 192; // Limit to 3 items (3 * 64 = 192B)

    // Insert 3 items into Node 1
    // Keys chosen to land in slots 0-5460
    const keys = ['k_a', 'k_b', 'k_c'];
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i]!;
      node1.storage[k] = {
        key: k,
        value: `val_${k}`,
        ttl: null,
        lastAccessedTick: i + 1,
        accessCount: 1,
        sizeBytes: 64,
      };
      node1.memoryUsedBytes += 64;
    }

    // Touch k_a to make it more recently used than k_b
    node1.storage['k_a']!.lastAccessedTick = 100;

    // Now insert a 4th key directly via state transition
    const insert4th: RedisSimEvent = {
      id: 'set-4',
      tick: 105,
      type: 'REDIS_SET',
      payload: {
        key: 'k_d',
        value: 'val_d',
        sizeBytes: 64,
      },
    };

    // If k_d hashes to Node 1's slot range
    node1.slotRanges = [{ startSlot: 0, endSlot: 16383 }]; // Temporarily map all slots to test eviction cleanly
    const res = pureRedisTransition(state, insert4th, rng);

    // Node 1 memory should remain <= 192B and least recently used (k_b, tick 2) should be evicted
    const updatedNode1 = res.nextState.nodes['1']!;
    expect(updatedNode1.memoryUsedBytes).toBeLessThanOrEqual(192);
    expect(updatedNode1.storage['k_b']).toBeUndefined(); // Evicted!
    expect(updatedNode1.storage['k_a']).toBeDefined(); // Retained (recently touched)
    expect(res.nextState.totalEvictions).toBeGreaterThanOrEqual(1);
  });

  it('should automatically promote replica when master crashes', () => {
    const rng = new DeterministicRNG(42);
    const cluster = createDefaultRedisCluster();

    // Crash Master 1
    const crashEv: RedisSimEvent = {
      id: 'crash-m1',
      tick: 50,
      type: 'REDIS_NODE_CRASH',
      payload: { nodeId: '1' },
    };

    let res = pureRedisTransition(cluster, crashEv, rng);
    expect(res.emittedEvents.length).toBe(1);
    expect(res.emittedEvents[0]?.type).toBe('REDIS_FAILOVER');

    // Process failover
    const failoverEv = res.emittedEvents[0]!;
    res = pureRedisTransition(res.nextState, failoverEv, rng);

    // Replica 4 should now be MASTER
    const nodes = Object.values(res.nextState.nodes) as RedisNode[];
    const node4 = nodes.find((n) => n.id === '4');
    expect(node4?.role).toBe('MASTER');
    expect(node4?.masterId).toBeNull();
  });
});
