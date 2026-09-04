import type {
  FixedWindowState,
  LeakyBucketState,
  SlidingCounterState,
  SlidingLogState,
  TokenBucketState,
} from './rate-limiter-types.js';

/**
 * Token Bucket Algorithm (RFC 2697 / RFC 2698)
 * Refills tokens continuously based on elapsed ticks.
 * Admits if tokens >= cost.
 */
export function stepTokenBucket(
  state: TokenBucketState,
  currentTick: number,
  cost = 1,
): { admitted: boolean; nextState: TokenBucketState } {
  const elapsed = Math.max(0, currentTick - state.lastRefillTick);
  const refilled = elapsed * state.refillRatePerTick;
  const newTokens = Math.min(state.capacity, state.tokens + refilled);

  if (newTokens >= cost) {
    return {
      admitted: true,
      nextState: {
        ...state,
        tokens: Number((newTokens - cost).toFixed(4)),
        lastRefillTick: currentTick,
      },
    };
  }

  return {
    admitted: false,
    nextState: {
      ...state,
      tokens: Number(newTokens.toFixed(4)),
      lastRefillTick: currentTick,
    },
  };
}

/**
 * Leaky Bucket Algorithm
 * Leaks (processes) queue items at a constant leakRatePerTick.
 * Queues up to capacity; drops if full.
 */
export function stepLeakyBucket(
  state: LeakyBucketState,
  currentTick: number,
  cost = 1,
): { admitted: boolean; nextState: LeakyBucketState } {
  const elapsed = Math.max(0, currentTick - state.lastLeakTick);
  const leaked = elapsed * state.leakRatePerTick;
  const currentQueue = Math.max(0, state.queueSize - leaked);

  if (currentQueue + cost <= state.capacity) {
    return {
      admitted: true,
      nextState: {
        ...state,
        queueSize: Number((currentQueue + cost).toFixed(4)),
        lastLeakTick: currentTick,
      },
    };
  }

  return {
    admitted: false,
    nextState: {
      ...state,
      queueSize: Number(currentQueue.toFixed(4)),
      lastLeakTick: currentTick,
    },
  };
}

/**
 * Fixed Window Counter
 * Tracks count within fixed boundaries [k * W, (k+1) * W).
 * Resets counter when crossing into a new window.
 * Known flaw: Allows up to 2x burst across boundary.
 */
export function stepFixedWindow(
  state: FixedWindowState,
  currentTick: number,
  cost = 1,
): { admitted: boolean; nextState: FixedWindowState } {
  const windowIndex = Math.floor(currentTick / state.windowSizeTicks);
  const currentWindowStart = windowIndex * state.windowSizeTicks;

  let count = state.count;
  if (currentWindowStart > state.windowStartTick) {
    count = 0;
  }

  if (count + cost <= state.limit) {
    return {
      admitted: true,
      nextState: {
        ...state,
        windowStartTick: currentWindowStart,
        count: count + cost,
      },
    };
  }

  return {
    admitted: false,
    nextState: {
      ...state,
      windowStartTick: currentWindowStart,
      count,
    },
  };
}

/**
 * Sliding Window Log
 * Keeps explicit timestamps of admitted requests in trailing window.
 * Accurate but O(N) memory.
 */
export function stepSlidingLog(
  state: SlidingLogState,
  currentTick: number,
  cost = 1,
): { admitted: boolean; nextState: SlidingLogState } {
  const windowStart = currentTick - state.windowSizeTicks;
  const filteredLog = state.log.filter((t) => t > windowStart);

  if (filteredLog.length + cost <= state.limit) {
    const newLog = [...filteredLog];
    for (let i = 0; i < cost; i++) {
      newLog.push(currentTick);
    }
    return {
      admitted: true,
      nextState: {
        ...state,
        log: newLog,
      },
    };
  }

  return {
    admitted: false,
    nextState: {
      ...state,
      log: filteredLog,
    },
  };
}

/**
 * Sliding Window Counter (Cloudflare Weighted Average Approximation)
 * Formula: count = previousWindowCount * (1 - timeIntoCurrent / windowSize) + currentWindowCount
 * Reference: Cloudflare blog "How we built rate limiting"
 */
export function stepSlidingCounter(
  state: SlidingCounterState,
  currentTick: number,
  cost = 1,
): { admitted: boolean; nextState: SlidingCounterState; estimatedCount: number } {
  const windowIndex = Math.floor(currentTick / state.windowSizeTicks);
  const windowStart = windowIndex * state.windowSizeTicks;

  let currentCount = state.currentCount;
  let previousCount = state.previousCount;
  let activeWindowStart = state.windowStartTick;

  if (windowStart > activeWindowStart) {
    const windowsElapsed = (windowStart - activeWindowStart) / state.windowSizeTicks;
    if (windowsElapsed === 1) {
      previousCount = currentCount;
      currentCount = 0;
    } else {
      previousCount = 0;
      currentCount = 0;
    }
    activeWindowStart = windowStart;
  }

  const timeIntoCurrent = currentTick - activeWindowStart;
  const overlapFraction = Math.max(0, 1 - timeIntoCurrent / state.windowSizeTicks);
  const estimatedCount = previousCount * overlapFraction + currentCount;

  if (estimatedCount + cost <= state.limit) {
    return {
      admitted: true,
      estimatedCount,
      nextState: {
        ...state,
        windowStartTick: activeWindowStart,
        currentCount: currentCount + cost,
        previousCount,
      },
    };
  }

  return {
    admitted: false,
    estimatedCount,
    nextState: {
      ...state,
      windowStartTick: activeWindowStart,
      currentCount,
      previousCount,
    },
  };
}
