import type { DeterministicRNG } from '../../prng/deterministic-rng.js';
import {
  stepFixedWindow,
  stepLeakyBucket,
  stepSlidingCounter,
  stepSlidingLog,
  stepTokenBucket,
} from './rate-limiter-algorithms.js';
import type {
  ClientRateLimiterState,
  RateLimiterAlgorithm,
  RateLimiterClusterState,
  RateLimiterSimEvent,
} from './rate-limiter-types.js';

export function createDefaultClient(
  clientId: string,
  capacity = 10,
  refillRatePerTick = 1,
  windowSizeTicks = 10,
  limit = 10,
): ClientRateLimiterState {
  return {
    clientId,
    tokenBucket: {
      tokens: capacity,
      capacity,
      refillRatePerTick,
      lastRefillTick: 0,
    },
    leakyBucket: {
      queueSize: 0,
      capacity,
      leakRatePerTick: refillRatePerTick,
      lastLeakTick: 0,
    },
    fixedWindow: {
      windowStartTick: 0,
      windowSizeTicks,
      limit,
      count: 0,
    },
    slidingLog: {
      windowSizeTicks,
      limit,
      log: [],
    },
    slidingCounter: {
      windowStartTick: 0,
      windowSizeTicks,
      limit,
      currentCount: 0,
      previousCount: 0,
    },
    totalAdmitted: {
      TOKEN_BUCKET: 0,
      LEAKY_BUCKET: 0,
      FIXED_WINDOW: 0,
      SLIDING_LOG: 0,
      SLIDING_COUNTER: 0,
    },
    totalDenied: {
      TOKEN_BUCKET: 0,
      LEAKY_BUCKET: 0,
      FIXED_WINDOW: 0,
      SLIDING_LOG: 0,
      SLIDING_COUNTER: 0,
    },
  };
}

export function createDefaultRateLimiterCluster(
  clusterId = 'rate-limiter-1',
): RateLimiterClusterState {
  const capacity = 10;
  const refillRatePerTick = 1;
  const windowSizeTicks = 10;
  const limit = 10;

  return {
    clusterId,
    tick: 0,
    activeAlgorithm: 'ALL_PARALLEL',
    backendMode: 'LOCAL_MEMORY',
    nodeCount: 3,
    globalCapacity: capacity,
    globalRefillRatePerTick: refillRatePerTick,
    globalWindowSizeTicks: windowSizeTicks,
    globalLimit: limit,
    clients: {
      'client-1': createDefaultClient(
        'client-1',
        capacity,
        refillRatePerTick,
        windowSizeTicks,
        limit,
      ),
      'client-2': createDefaultClient(
        'client-2',
        capacity,
        refillRatePerTick,
        windowSizeTicks,
        limit,
      ),
      'client-3': createDefaultClient(
        'client-3',
        capacity,
        refillRatePerTick,
        windowSizeTicks,
        limit,
      ),
    },
    recentRequests: [],
    flawsDemonstrated: {
      fixedWindowBoundaryBurstDetected: false,
      localMemoryClusterMultiplierDetected: false,
      slidingCounterDivergence: 0,
    },
  };
}

export function pureRateLimiterTransition(
  state: RateLimiterClusterState,
  event: RateLimiterSimEvent,
  _rng: DeterministicRNG,
): { nextState: RateLimiterClusterState; emittedEvents: RateLimiterSimEvent[] } {
  const nextState: RateLimiterClusterState = JSON.parse(
    JSON.stringify(state),
  ) as RateLimiterClusterState;
  nextState.tick = event.tick;

  switch (event.type) {
    case 'RATE_LIMITER_REQUEST': {
      const clientId = event.payload.clientId;
      const cost = event.payload.cost ?? 1;
      const targetNodeId = event.payload.targetNodeId ?? 'node-1';

      let client = nextState.clients[clientId];
      if (!client) {
        client = createDefaultClient(
          clientId,
          nextState.globalCapacity,
          nextState.globalRefillRatePerTick,
          nextState.globalWindowSizeTicks,
          nextState.globalLimit,
        );
        nextState.clients[clientId] = client;
      }

      // Step all 5 algorithms
      const tb = stepTokenBucket(client.tokenBucket, event.tick, cost);
      client.tokenBucket = tb.nextState;

      const lb = stepLeakyBucket(client.leakyBucket, event.tick, cost);
      client.leakyBucket = lb.nextState;

      const fw = stepFixedWindow(client.fixedWindow, event.tick, cost);
      client.fixedWindow = fw.nextState;

      const sl = stepSlidingLog(client.slidingLog, event.tick, cost);
      client.slidingLog = sl.nextState;

      const sc = stepSlidingCounter(client.slidingCounter, event.tick, cost);
      client.slidingCounter = sc.nextState;

      const admittedBy: Record<RateLimiterAlgorithm, boolean> = {
        TOKEN_BUCKET: tb.admitted,
        LEAKY_BUCKET: lb.admitted,
        FIXED_WINDOW: fw.admitted,
        SLIDING_LOG: sl.admitted,
        SLIDING_COUNTER: sc.admitted,
      };

      for (const alg of [
        'TOKEN_BUCKET',
        'LEAKY_BUCKET',
        'FIXED_WINDOW',
        'SLIDING_LOG',
        'SLIDING_COUNTER',
      ] as RateLimiterAlgorithm[]) {
        if (admittedBy[alg]) {
          client.totalAdmitted[alg] += 1;
        } else {
          client.totalDenied[alg] += 1;
        }
      }

      // Record recent request
      nextState.recentRequests.push({
        id: event.id,
        clientId,
        tick: event.tick,
        nodeId: targetNodeId,
        admittedBy,
      });
      if (nextState.recentRequests.length > 50) {
        nextState.recentRequests.shift();
      }

      // Check for RL-3: Fixed window boundary burst demonstration
      // (Admitted in Fixed Window when a strict sliding window would have denied)
      if (fw.admitted && !sl.admitted) {
        nextState.flawsDemonstrated.fixedWindowBoundaryBurstDetected = true;
      }

      // Check divergence between Sliding Log and Sliding Counter
      const divergence = Math.abs(
        client.totalAdmitted.SLIDING_LOG - client.totalAdmitted.SLIDING_COUNTER,
      );
      nextState.flawsDemonstrated.slidingCounterDivergence = divergence;
      break;
    }

    case 'RATE_LIMITER_BURST': {
      const { clientId, count } = event.payload;
      for (let i = 0; i < count; i++) {
        const subEvent: RateLimiterSimEvent = {
          id: `${event.id}-burst-${i}`,
          tick: event.tick,
          type: 'RATE_LIMITER_REQUEST',
          payload: { clientId },
        };
        const res = pureRateLimiterTransition(nextState, subEvent, _rng);
        Object.assign(nextState, res.nextState);
      }
      break;
    }

    case 'RATE_LIMITER_UPDATE_CONFIG': {
      const p = event.payload;
      if (p.capacity !== undefined) nextState.globalCapacity = p.capacity;
      if (p.refillRatePerTick !== undefined)
        nextState.globalRefillRatePerTick = p.refillRatePerTick;
      if (p.windowSizeTicks !== undefined) nextState.globalWindowSizeTicks = p.windowSizeTicks;
      if (p.limit !== undefined) nextState.globalLimit = p.limit;
      if (p.backendMode !== undefined) nextState.backendMode = p.backendMode;
      if (p.activeAlgorithm !== undefined) nextState.activeAlgorithm = p.activeAlgorithm;
      if (p.nodeCount !== undefined) nextState.nodeCount = p.nodeCount;

      // Update all clients with new parameters
      for (const client of Object.values(nextState.clients)) {
        client.tokenBucket.capacity = nextState.globalCapacity;
        client.tokenBucket.refillRatePerTick = nextState.globalRefillRatePerTick;
        client.leakyBucket.capacity = nextState.globalCapacity;
        client.leakyBucket.leakRatePerTick = nextState.globalRefillRatePerTick;
        client.fixedWindow.windowSizeTicks = nextState.globalWindowSizeTicks;
        client.fixedWindow.limit = nextState.globalLimit;
        client.slidingLog.windowSizeTicks = nextState.globalWindowSizeTicks;
        client.slidingLog.limit = nextState.globalLimit;
        client.slidingCounter.windowSizeTicks = nextState.globalWindowSizeTicks;
        client.slidingCounter.limit = nextState.globalLimit;
      }
      break;
    }

    case 'TICK' as any:
    case 'RATE_LIMITER_TICK': {
      // Periodic clock advance: update token refilling and leaky queue drains
      for (const client of Object.values(nextState.clients)) {
        const tbElapsed = Math.max(0, event.tick - client.tokenBucket.lastRefillTick);
        client.tokenBucket.tokens = Math.min(
          client.tokenBucket.capacity,
          Number(
            (client.tokenBucket.tokens + tbElapsed * client.tokenBucket.refillRatePerTick).toFixed(
              4,
            ),
          ),
        );
        client.tokenBucket.lastRefillTick = event.tick;

        const lbElapsed = Math.max(0, event.tick - client.leakyBucket.lastLeakTick);
        client.leakyBucket.queueSize = Math.max(
          0,
          Number(
            (client.leakyBucket.queueSize - lbElapsed * client.leakyBucket.leakRatePerTick).toFixed(
              4,
            ),
          ),
        );
        client.leakyBucket.lastLeakTick = event.tick;
      }
      break;
    }
  }

  nextState.rngState = _rng.getState();
  return { nextState, emittedEvents: [] };
}
