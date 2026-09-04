import { DeterministicRNG } from '../../prng/deterministic-rng.js';
import type { EvictionPolicy, RedisNode } from './redis-types.js';

export interface EvictionResult {
  success: boolean;
  evictedKeys: string[];
}

/**
 * Real Redis Approximate Eviction Algorithm (redis.conf: maxmemory-samples):
 * Redis does not perform global O(N) sort. It takes a random sample of N keys
 * (default 5) from the candidate pool and evicts the best candidate among that sample.
 */
export function evictUntilMemoryAvailable(
  node: RedisNode,
  requiredBytes: number,
  policy: EvictionPolicy,
  rng: DeterministicRNG,
  sampleCount = 5,
): EvictionResult {
  const evictedKeys: string[] = [];

  while (node.memoryUsedBytes + requiredBytes > node.maxMemoryBytes) {
    const keys = Object.keys(node.storage);
    if (keys.length === 0) break;

    if (policy === 'noeviction') {
      return { success: false, evictedKeys };
    }

    const isVolatile = policy.startsWith('volatile-');
    const candidatePool = isVolatile
      ? keys.filter((k) => node.storage[k]?.ttl !== null)
      : keys;

    if (candidatePool.length === 0) {
      // If volatile policy but no keys with TTL, fallback or return failure
      return { success: false, evictedKeys };
    }

    // Sample N distinct candidate keys (Redis dictGetSomeKeys / sampling)
    let samples: string[] = [];
    if (candidatePool.length <= sampleCount) {
      samples = [...candidatePool];
    } else {
      const poolCopy = [...candidatePool];
      for (let i = 0; i < sampleCount && poolCopy.length > 0; i++) {
        const idx = rng.nextInt(0, poolCopy.length - 1);
        samples.push(poolCopy.splice(idx, 1)[0]!);
      }
    }

    let keyToEvict: string | null = null;

    if (policy === 'allkeys-lru' || policy === 'volatile-lru') {
      // Pick key with oldest lastAccessedTick in sample
      let oldestTick = Infinity;
      for (const k of samples) {
        const entry = node.storage[k];
        if (entry && entry.lastAccessedTick < oldestTick) {
          oldestTick = entry.lastAccessedTick;
          keyToEvict = k;
        }
      }
    } else if (policy === 'allkeys-lfu' || policy === 'volatile-lfu') {
      // Pick key with lowest accessCount in sample
      let lowestAccess = Infinity;
      for (const k of samples) {
        const entry = node.storage[k];
        if (entry && entry.accessCount < lowestAccess) {
          lowestAccess = entry.accessCount;
          keyToEvict = k;
        }
      }
    } else if (policy === 'volatile-ttl') {
      // Pick key with shortest TTL in sample
      let shortestTTL = Infinity;
      for (const k of samples) {
        const entry = node.storage[k];
        if (entry && entry.ttl !== null && entry.ttl < shortestTTL) {
          shortestTTL = entry.ttl;
          keyToEvict = k;
        }
      }
    } else if (policy === 'allkeys-random' || policy === 'volatile-random') {
      keyToEvict = rng.pick(samples);
    }

    if (keyToEvict && node.storage[keyToEvict]) {
      const size = node.storage[keyToEvict]?.sizeBytes ?? 64;
      delete node.storage[keyToEvict];
      node.memoryUsedBytes = Math.max(0, node.memoryUsedBytes - size);
      evictedKeys.push(keyToEvict);
    } else {
      break;
    }
  }

  const success = node.memoryUsedBytes + requiredBytes <= node.maxMemoryBytes;
  return { success, evictedKeys };
}
