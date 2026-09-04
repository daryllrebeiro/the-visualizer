import type { CdnCacheClusterState } from './cdn-cache-types.js';

export interface CdnInvariantViolation {
  ruleId: 'CDN-1' | 'CDN-2' | 'CDN-3' | 'CDN-4';
  invariantName: string;
  description: string;
  isPedagogicalFlaw?: boolean;
  pedagogicalNote?: string;
  affectedEntities: string[];
}

export class CdnCacheInvariantChecker {
  public check(state: CdnCacheClusterState): CdnInvariantViolation | undefined {
    // CDN-1: Staleness Bound (RFC 9111 & RFC 5861)
    for (const [popId, pop] of Object.entries(state.edgePops)) {
      for (const [key, entry] of Object.entries(pop.cache)) {
        if (entry.purged) continue;
        const age = state.tick - entry.cachedAtTick;
        const maxPermittedAge = entry.maxAgeTicks + entry.staleWhileRevalidateTicks;
        if (age > maxPermittedAge && !entry.isRevalidating) {
          return {
            ruleId: 'CDN-1',
            invariantName: 'Staleness Bound Exceeded',
            description: `Edge PoP ${popId} key ${key} age ${age} ticks exceeds max allowable staleness ${maxPermittedAge}`,
            affectedEntities: [popId, key],
          };
        }
      }
    }

    // CDN-3: Purge Propagation Completeness
    for (const purge of state.purges) {
      if (!purge.completed) {
        continue;
      }
      for (const [popId, pop] of Object.entries(state.edgePops)) {
        const entry = pop.cache[purge.key];
        if (entry && !entry.purged) {
          return {
            ruleId: 'CDN-3',
            invariantName: 'Purge Propagation Incomplete',
            description: `Edge PoP ${popId} continues to serve purged key ${purge.key} after purge completion`,
            affectedEntities: [popId, purge.key],
          };
        }
      }
    }

    // CDN-2: Cache Stampede Hazard (Intentionally-demonstrable when coalescing disabled)
    if (state.flawsDemonstrated.cacheStampedeOriginSpikeDetected) {
      return {
        ruleId: 'CDN-2',
        invariantName: 'Single-Flight Coalescing Disabled (Cache Stampede)',
        description:
          'Flash crowd on cold key triggered N simultaneous origin fetches due to disabled request coalescing',
        isPedagogicalFlaw: true,
        pedagogicalNote:
          'Without request coalescing (single-flight origin fetching), a cache miss under flash crowd traffic overwhelms the origin server (the classic thundering herd problem).',
        affectedEntities: ['origin-primary-1'],
      };
    }

    return undefined;
  }
}
