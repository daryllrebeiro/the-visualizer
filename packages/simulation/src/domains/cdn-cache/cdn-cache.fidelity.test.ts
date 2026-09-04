import { describe, expect, it } from 'vitest';

import { DeterministicRNG } from '../../prng/deterministic-rng.js';
import { CdnCacheInvariantChecker } from './cdn-cache-invariants.js';
import {
  createDefaultCdnCacheCluster,
  pureCdnCacheTransition,
} from './cdn-cache-state-transitions.js';

describe('CDN & Multi-Tier Caching Fidelity Suite', () => {
  const rng = new DeterministicRNG(42);
  const checker = new CdnCacheInvariantChecker();

  it('CDN-1: Respects RFC 9111 max-age and stale-while-revalidate window', () => {
    let state = createDefaultCdnCacheCluster();
    const key = '/static/banner.jpg';

    // 1. Initial fetch at tick 0 (populates cache with max-age=10, SWR=10)
    state = pureCdnCacheTransition(
      state,
      { id: 'req-init', tick: 0, type: 'CDN_REQUEST', payload: { key, clientRegion: 'US_EAST' } },
      rng,
    ).nextState;

    expect(state.edgePops['pop-us-east']?.cache[key]?.value).toBe('JPEG_IMG_V1');
    expect(state.origin.totalRequestsReceived).toBe(1);

    // 2. Request at tick 5 (Fresh hit)
    state = pureCdnCacheTransition(
      state,
      { id: 'req-fresh', tick: 5, type: 'CDN_REQUEST', payload: { key, clientRegion: 'US_EAST' } },
      rng,
    ).nextState;
    expect(state.edgePops['pop-us-east']?.totalHits).toBe(1);
    expect(state.origin.totalRequestsReceived).toBe(1); // No new origin fetch

    // 3. Request at tick 15 (Inside stale-while-revalidate window [10, 20])
    state = pureCdnCacheTransition(
      state,
      { id: 'req-swr', tick: 15, type: 'CDN_REQUEST', payload: { key, clientRegion: 'US_EAST' } },
      rng,
    ).nextState;
    expect(state.edgePops['pop-us-east']?.totalStaleServed).toBe(1);

    const violation = checker.check(state);
    expect(violation).toBeUndefined();
  });

  it('CDN-2: Verifies single-flight coalescing under flash crowd traffic', () => {
    let state = createDefaultCdnCacheCluster();
    const coldKey = '/app.js';

    // Flash crowd of 20 concurrent requests with coalescing ENABLED
    state = pureCdnCacheTransition(
      state,
      {
        id: 'flash-coalesced',
        tick: 1,
        type: 'CDN_FLASH_CROWD',
        payload: { key: coldKey, requestCount: 20 },
      },
      rng,
    ).nextState;

    // Only 1 origin fetch occurred!
    expect(state.origin.totalRequestsReceived).toBe(1);
    expect(state.flawsDemonstrated.cacheStampedeOriginSpikeDetected).toBe(false);
  });

  it('CDN-2: Demonstrates cache stampede when request coalescing is disabled', () => {
    let state = createDefaultCdnCacheCluster();
    state.coalescingEnabled = false; // Disable coalescing
    const coldKey = '/api/config';

    // Flash crowd of 10 requests without coalescing
    state = pureCdnCacheTransition(
      state,
      {
        id: 'flash-stampede',
        tick: 1,
        type: 'CDN_FLASH_CROWD',
        payload: { key: coldKey, requestCount: 10 },
      },
      rng,
    ).nextState;

    // Stampede triggered: origin received all 10 requests!
    expect(state.origin.totalRequestsReceived).toBe(10);
    expect(state.flawsDemonstrated.cacheStampedeOriginSpikeDetected).toBe(true);

    const v = checker.check(state);
    expect(v?.ruleId).toBe('CDN-2');
    expect(v?.isPedagogicalFlaw).toBe(true);
  });

  it('CDN-3: Verifies fleet-wide purge propagation completeness', () => {
    let state = createDefaultCdnCacheCluster();
    const key = '/static/banner.jpg';

    // Warm cache at US_EAST and EU_WEST
    state = pureCdnCacheTransition(
      state,
      { id: 'warm-us', tick: 1, type: 'CDN_REQUEST', payload: { key, clientRegion: 'US_EAST' } },
      rng,
    ).nextState;
    state = pureCdnCacheTransition(
      state,
      { id: 'warm-eu', tick: 1, type: 'CDN_REQUEST', payload: { key, clientRegion: 'EU_WEST' } },
      rng,
    ).nextState;

    expect(state.edgePops['pop-us-east']?.cache[key]?.purged).toBe(false);
    expect(state.edgePops['pop-eu-west']?.cache[key]?.purged).toBe(false);

    // Fire fleet purge
    state = pureCdnCacheTransition(
      state,
      { id: 'purge-op-1', tick: 2, type: 'CDN_PURGE_KEY', payload: { key } },
      rng,
    ).nextState;

    // Purged across all edge PoPs
    expect(state.edgePops['pop-us-east']?.cache[key]?.purged).toBe(true);
    expect(state.edgePops['pop-eu-west']?.cache[key]?.purged).toBe(true);

    const v = checker.check(state);
    expect(v).toBeUndefined();
  });

  it('CDN-4: Demonstrates tiered cache offload (Regional Shield absorbs edge misses)', () => {
    let state = createDefaultCdnCacheCluster();
    const key = '/app.js';

    // Request from US_EAST -> populates pop-us-east and reg-us (1 origin fetch)
    state = pureCdnCacheTransition(
      state,
      { id: 'req-east', tick: 1, type: 'CDN_REQUEST', payload: { key, clientRegion: 'US_EAST' } },
      rng,
    ).nextState;
    expect(state.origin.totalRequestsReceived).toBe(1);

    // Subsequent request from US_WEST (different edge PoP, but shared regional shield reg-us)
    state = pureCdnCacheTransition(
      state,
      { id: 'req-west', tick: 2, type: 'CDN_REQUEST', payload: { key, clientRegion: 'US_WEST' } },
      rng,
    ).nextState;

    // reg-us absorbed the edge miss; origin request count remains 1!
    expect(state.regionalTiers['reg-us']?.totalHits).toBe(1);
    expect(state.origin.totalRequestsReceived).toBe(1);
  });
});
