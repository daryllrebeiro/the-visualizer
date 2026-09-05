/**
 * Rate Limiter Simulation Types & State Model
 *
 * References:
 * - RFC 2697: Single Rate Three Color Marker (Token Bucket)
 * - Cloudflare: How we built rate limiting (Sliding Window Counter Approximation)
 * - Stripe: Rate limiters and shedding techniques
 */

export type RateLimiterAlgorithm =
  'TOKEN_BUCKET' | 'LEAKY_BUCKET' | 'FIXED_WINDOW' | 'SLIDING_LOG' | 'SLIDING_COUNTER';

export type RateLimiterBackendMode = 'LOCAL_MEMORY' | 'SHARED_REDIS';

export interface TokenBucketState {
  tokens: number;
  capacity: number;
  refillRatePerTick: number;
  lastRefillTick: number;
}

export interface LeakyBucketState {
  queueSize: number;
  capacity: number;
  leakRatePerTick: number;
  lastLeakTick: number;
}

export interface FixedWindowState {
  windowStartTick: number;
  windowSizeTicks: number;
  limit: number;
  count: number;
}

export interface SlidingLogState {
  windowSizeTicks: number;
  limit: number;
  log: number[]; // ticks of admitted requests
}

export interface SlidingCounterState {
  windowStartTick: number;
  windowSizeTicks: number;
  limit: number;
  currentCount: number;
  previousCount: number;
}

export interface ClientRateLimiterState {
  clientId: string;
  tokenBucket: TokenBucketState;
  leakyBucket: LeakyBucketState;
  fixedWindow: FixedWindowState;
  slidingLog: SlidingLogState;
  slidingCounter: SlidingCounterState;
  totalAdmitted: Record<RateLimiterAlgorithm, number>;
  totalDenied: Record<RateLimiterAlgorithm, number>;
}

import type { RedisClusterState } from '../redis/redis-types.js';

export interface RateLimiterClusterState {
  clusterId: string;
  tick: number;
  rngState?: number;
  activeAlgorithm: RateLimiterAlgorithm | 'ALL_PARALLEL';
  backendMode: RateLimiterBackendMode;
  nodeCount: number; // For local-memory distributed multiplier simulation
  globalCapacity: number;
  globalRefillRatePerTick: number;
  globalWindowSizeTicks: number;
  globalLimit: number;
  clients: Record<string, ClientRateLimiterState>;
  recentRequests: Array<{
    id: string;
    clientId: string;
    tick: number;
    nodeId: string;
    admittedBy: Record<RateLimiterAlgorithm, boolean>;
  }>;
  redisCluster?: RedisClusterState;
  redisMetrics?: {
    totalCommands: number;
    commandsByOp: Record<string, number>;
    lastRoutedNodeId: string | null;
    lastSlot: number | null;
  };
  flawsDemonstrated: {
    fixedWindowBoundaryBurstDetected: boolean;
    localMemoryClusterMultiplierDetected: boolean;
    slidingCounterDivergence: number;
  };
}

export type RateLimiterSimEvent =
  | {
      id: string;
      tick: number;
      type: 'RATE_LIMITER_REQUEST';
      payload: {
        clientId: string;
        cost?: number;
        targetNodeId?: string;
      };
    }
  | {
      id: string;
      tick: number;
      type: 'RATE_LIMITER_BURST';
      payload: {
        clientId: string;
        count: number;
      };
    }
  | {
      id: string;
      tick: number;
      type: 'RATE_LIMITER_UPDATE_CONFIG';
      payload: {
        capacity?: number;
        refillRatePerTick?: number;
        windowSizeTicks?: number;
        limit?: number;
        backendMode?: RateLimiterBackendMode;
        activeAlgorithm?: RateLimiterAlgorithm | 'ALL_PARALLEL';
        nodeCount?: number;
      };
    }
  | {
      id: string;
      tick: number;
      type: 'RATE_LIMITER_TICK';
      payload: Record<string, unknown>;
    };
