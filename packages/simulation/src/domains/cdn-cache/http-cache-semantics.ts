import type { CacheEntry } from './cdn-cache-types.js';

export type CacheFreshnessStatus = 'FRESH' | 'STALE_WHILE_REVALIDATE' | 'EXPIRED_OR_PURGED';

/**
 * RFC 9111 Section 4.2: Freshness Lifetime & Age Calculation
 * RFC 5861: stale-while-revalidate
 */
export function evaluateEntryFreshness(
  entry: CacheEntry | undefined,
  currentTick: number,
): CacheFreshnessStatus {
  if (!entry || entry.purged) {
    return 'EXPIRED_OR_PURGED';
  }

  const age = Math.max(0, currentTick - entry.cachedAtTick);

  if (age <= entry.maxAgeTicks) {
    return 'FRESH';
  }

  if (age <= entry.maxAgeTicks + entry.staleWhileRevalidateTicks) {
    return 'STALE_WHILE_REVALIDATE';
  }

  return 'EXPIRED_OR_PURGED';
}

/**
 * RFC 9111 Section 3.2: Conditional Validation (If-None-Match with ETag)
 */
export function validateConditionalEtag(
  clientEtag: string,
  originEtag: string,
): { isNotModified: boolean; statusCode: 304 | 200 } {
  if (clientEtag === originEtag) {
    return { isNotModified: true, statusCode: 304 };
  }
  return { isNotModified: false, statusCode: 200 };
}
