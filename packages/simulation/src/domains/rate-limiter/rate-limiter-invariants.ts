import type { RateLimiterClusterState } from './rate-limiter-types.js';

export interface RateLimiterInvariantViolation {
  ruleId: 'RL-1' | 'RL-2' | 'RL-3' | 'RL-4';
  invariantName: string;
  description: string;
  isPedagogicalFlaw?: boolean;
  pedagogicalNote?: string;
  affectedEntities: string[];
}

export class RateLimiterInvariantChecker {
  public check(state: RateLimiterClusterState): RateLimiterInvariantViolation | undefined {
    // RL-1: Token Bucket Bounded (0 <= tokens <= capacity)
    for (const [clientId, client] of Object.entries(state.clients)) {
      const tb = client.tokenBucket;
      if (tb.tokens < 0 || tb.tokens > tb.capacity + 0.0001) {
        return {
          ruleId: 'RL-1',
          invariantName: 'Token Bucket Bounded',
          description: `Client ${clientId} token count ${tb.tokens} is outside [0, ${tb.capacity}]`,
          affectedEntities: [clientId],
        };
      }
    }

    // RL-2: Configured Rate Never Exceeded (Sliding Window Log)
    for (const [clientId, client] of Object.entries(state.clients)) {
      const sl = client.slidingLog;
      const windowStart = state.tick - sl.windowSizeTicks;
      const recentCount = sl.log.filter((t) => t > windowStart).length;
      if (recentCount > sl.limit) {
        return {
          ruleId: 'RL-2',
          invariantName: 'Configured Rate Never Exceeded (Exact Algorithm)',
          description: `Client ${clientId} admitted ${recentCount} requests in trailing ${sl.windowSizeTicks} ticks, exceeding limit ${sl.limit}`,
          affectedEntities: [clientId],
        };
      }
    }

    // RL-3: Fixed Window Boundary Burst (Intentionally-Violable Pedagogical Check)
    if (state.flawsDemonstrated.fixedWindowBoundaryBurstDetected) {
      return {
        ruleId: 'RL-3',
        invariantName: 'Fixed Window Boundary Burst Flaw',
        description:
          'Fixed Window admitted a burst exceeding rate limit across window boundary (up to 2x capacity allowed)',
        isPedagogicalFlaw: true,
        pedagogicalNote:
          'Fixed Window Counter resets at clock boundaries, allowing back-to-back quota bursts (e.g. at boundary 11:59:59 and 12:00:00). This illustrates why Fixed Window is often disqualified in production interviews.',
        affectedEntities: ['fixed-window'],
      };
    }

    // RL-4: Sliding Window Counter Approximation Bound
    for (const [clientId, client] of Object.entries(state.clients)) {
      const divergence = Math.abs(
        client.totalAdmitted.SLIDING_LOG - client.totalAdmitted.SLIDING_COUNTER,
      );
      // Cloudflare sliding counter theoretical max divergence under step traffic is bounded by limit * 0.5
      const maxAllowedDivergence = Math.max(5, Math.ceil(state.globalLimit * 0.5));
      if (divergence > maxAllowedDivergence) {
        return {
          ruleId: 'RL-4',
          invariantName: 'Sliding Window Counter Approximation Bound',
          description: `Client ${clientId} divergence between Sliding Log (${client.totalAdmitted.SLIDING_LOG}) and Sliding Counter (${client.totalAdmitted.SLIDING_COUNTER}) is ${divergence}, exceeding bound ${maxAllowedDivergence}`,
          affectedEntities: [clientId],
        };
      }
    }

    return undefined;
  }
}
