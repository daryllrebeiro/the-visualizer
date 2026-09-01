import { DeterministicRNG } from '../../prng/deterministic-rng.js';
import type { EvictionPolicy, RedisNode } from './redis-types.js';

export interface EvictionResult {
  success: boolean;
  evictedKeys: string[];
}

export function evictUntilMemoryAvailable(
  node: RedisNode,
  requiredBytes: number,
  policy: EvictionPolicy,
  rng: DeterministicRNG,
): EvictionResult {
  const evictedKeys: string[] = [];

  while (node.memoryUsedBytes + requiredBytes > node.maxMemoryBytes) {
    const keys = Object.keys(node.storage);
    if (keys.length === 0) break;

    if (policy === 'noeviction') {
      return { success: false, evictedKeys };
    }

    let keyToEvict: string | null = null;

    if (policy === 'allkeys-lru') {
      let oldestTick = Infinity;
      for (const k of keys) {
        const entry = node.storage[k];
        if (entry && entry.lastAccessedTick < oldestTick) {
          oldestTick = entry.lastAccessedTick;
          keyToEvict = k;
        }
      }
    } else if (policy === 'allkeys-lfu') {
      let lowestAccess = Infinity;
      for (const k of keys) {
        const entry = node.storage[k];
        if (entry && entry.accessCount < lowestAccess) {
          lowestAccess = entry.accessCount;
          keyToEvict = k;
        }
      }
    } else if (policy === 'volatile-ttl') {
      let shortestTTL = Infinity;
      for (const k of keys) {
        const entry = node.storage[k];
        if (entry && entry.ttl !== null && entry.ttl < shortestTTL) {
          shortestTTL = entry.ttl;
          keyToEvict = k;
        }
      }
      // Fallback if no keys have volatile TTL
      if (!keyToEvict) {
        keyToEvict = keys[0] ?? null;
      }
    } else if (policy === 'allkeys-random') {
      keyToEvict = rng.pick(keys);
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
