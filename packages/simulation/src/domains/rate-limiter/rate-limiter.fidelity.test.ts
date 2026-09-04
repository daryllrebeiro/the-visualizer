import { describe, expect, it } from 'vitest';

import { DeterministicRNG } from '../../prng/deterministic-rng.js';
import { RateLimiterInvariantChecker } from './rate-limiter-invariants.js';
import {
  createDefaultRateLimiterCluster,
  pureRateLimiterTransition,
} from './rate-limiter-state-transitions.js';
import type { RateLimiterSimEvent } from './rate-limiter-types.js';

describe('Rate Limiter Domain Fidelity Suite', () => {
  const rng = new DeterministicRNG(42);
  const checker = new RateLimiterInvariantChecker();

  it('RL-1: Enforces Token Bucket capacity floor (0) and ceiling (capacity)', () => {
    let state = createDefaultRateLimiterCluster();
    const clientId = 'client-1';

    // Consume all 10 tokens
    for (let i = 0; i < 15; i++) {
      const event: RateLimiterSimEvent = {
        id: `req-${i}`,
        tick: 1,
        type: 'RATE_LIMITER_REQUEST',
        payload: { clientId },
      };
      state = pureRateLimiterTransition(state, event, rng).nextState;
    }

    // Token count should be 0, not negative
    expect(state.clients[clientId]?.tokenBucket.tokens).toBe(0);
    expect(state.clients[clientId]?.totalAdmitted.TOKEN_BUCKET).toBe(10);
    expect(state.clients[clientId]?.totalDenied.TOKEN_BUCKET).toBe(5);

    // Let time advance 50 ticks (capacity is 10, refill is 1/tick)
    const tickEvent: RateLimiterSimEvent = {
      id: 'tick-advance',
      tick: 51,
      type: 'RATE_LIMITER_TICK',
      payload: {},
    };
    state = pureRateLimiterTransition(state, tickEvent, rng).nextState;

    // Must cap at capacity (10), not 50
    expect(state.clients[clientId]?.tokenBucket.tokens).toBe(10);

    const violation = checker.check(state);
    expect(violation).toBeUndefined();
  });

  it('RL-2: Sliding Window Log strictly respects configured rate limit over trailing window', () => {
    let state = createDefaultRateLimiterCluster();
    const clientId = 'client-1';
    // Limit is 10 per 10 ticks

    for (let i = 0; i < 20; i++) {
      const event: RateLimiterSimEvent = {
        id: `req-log-${i}`,
        tick: 5, // All at tick 5
        type: 'RATE_LIMITER_REQUEST',
        payload: { clientId },
      };
      state = pureRateLimiterTransition(state, event, rng).nextState;
    }

    expect(state.clients[clientId]?.totalAdmitted.SLIDING_LOG).toBe(10);
    expect(state.clients[clientId]?.totalDenied.SLIDING_LOG).toBe(10);

    const violation = checker.check(state);
    expect(violation).toBeUndefined();
  });

  it('RL-3: Demonstrates Fixed Window boundary burst flaw under staged boundary traffic', () => {
    let state = createDefaultRateLimiterCluster();
    const clientId = 'client-1';
    // Window size = 10 ticks, limit = 10

    // Send 10 requests at tick 9 (end of window 0)
    for (let i = 0; i < 10; i++) {
      const event: RateLimiterSimEvent = {
        id: `req-w0-${i}`,
        tick: 9,
        type: 'RATE_LIMITER_REQUEST',
        payload: { clientId },
      };
      state = pureRateLimiterTransition(state, event, rng).nextState;
    }

    expect(state.clients[clientId]?.totalAdmitted.FIXED_WINDOW).toBe(10);

    // Send 10 requests at tick 10 (start of window 1)
    for (let i = 0; i < 10; i++) {
      const event: RateLimiterSimEvent = {
        id: `req-w1-${i}`,
        tick: 10,
        type: 'RATE_LIMITER_REQUEST',
        payload: { clientId },
      };
      state = pureRateLimiterTransition(state, event, rng).nextState;
    }

    // Fixed Window admitted 20 requests in a span of 2 ticks!
    expect(state.clients[clientId]?.totalAdmitted.FIXED_WINDOW).toBe(20);
    // While Sliding Window Log strictly admitted only 10
    expect(state.clients[clientId]?.totalAdmitted.SLIDING_LOG).toBe(10);

    // Flaw demonstrated!
    expect(state.flawsDemonstrated.fixedWindowBoundaryBurstDetected).toBe(true);

    const violation = checker.check(state);
    expect(violation).toBeDefined();
    expect(violation?.ruleId).toBe('RL-3');
    expect(violation?.isPedagogicalFlaw).toBe(true);
  });

  it('RL-4: Verifies Cloudflare Sliding Window Counter approximation bounds', () => {
    let state = createDefaultRateLimiterCluster();
    const clientId = 'client-1';

    // Simulate dispersed traffic across ticks 0 to 50
    for (let t = 0; t <= 50; t += 2) {
      const event: RateLimiterSimEvent = {
        id: `traffic-step-${t}`,
        tick: t,
        type: 'RATE_LIMITER_REQUEST',
        payload: { clientId },
      };
      state = pureRateLimiterTransition(state, event, rng).nextState;
    }

    const logAdmitted = state.clients[clientId]?.totalAdmitted.SLIDING_LOG ?? 0;
    const counterAdmitted = state.clients[clientId]?.totalAdmitted.SLIDING_COUNTER ?? 0;
    const divergence = Math.abs(logAdmitted - counterAdmitted);

    // Bounded by theoretical error margin
    expect(divergence).toBeLessThanOrEqual(Math.ceil(state.globalLimit * 0.5));
  });

  it('Evaluates all 5 algorithms side-by-side with identical injected traffic', () => {
    let state = createDefaultRateLimiterCluster();
    const clientId = 'client-2';

    // Burst of 15 requests
    const burstEvent: RateLimiterSimEvent = {
      id: 'burst-event-1',
      tick: 1,
      type: 'RATE_LIMITER_BURST',
      payload: { clientId, count: 15 },
    };
    state = pureRateLimiterTransition(state, burstEvent, rng).nextState;

    const admitted = state.clients[clientId]!.totalAdmitted;
    expect(admitted.TOKEN_BUCKET).toBe(10);
    expect(admitted.LEAKY_BUCKET).toBe(10);
    expect(admitted.FIXED_WINDOW).toBe(10);
    expect(admitted.SLIDING_LOG).toBe(10);
    expect(admitted.SLIDING_COUNTER).toBe(10);
  });
});
