import type { NetworkingClusterState } from './networking-types.js';

export interface NetworkInvariantViolation {
  ruleId: string;
  invariantName: string;
  description: string;
  affectedEntities: string[];
}

export class NetworkInvariantChecker {
  public check(state: NetworkingClusterState): NetworkInvariantViolation | undefined {
    // 1. Congestion Window Positive
    if (state.congestion.cwnd <= 0) {
      return {
        ruleId: 'TCP_CWND_NON_POSITIVE',
        invariantName: 'Congestion Window Positivity',
        description: `Congestion window cwnd (${String(state.congestion.cwnd)}) must be positive`,
        affectedEntities: ['congestion'],
      };
    }

    // 2. Slow Start Threshold Positive
    if (state.congestion.ssthresh < 2) {
      return {
        ruleId: 'TCP_SSTHRESH_BOUND',
        invariantName: 'Slow Start Threshold Minimum',
        description: `ssthresh (${String(state.congestion.ssthresh)}) cannot fall below 2 MSS`,
        affectedEntities: ['congestion'],
      };
    }

    // 3. NET-3: Exact Mode-Aware Multiplicative Decrease Factor Check
    if (state.totalPacketsDropped > 0 || state.congestion.lastLossTick > 0) {
      const isCubic = state.congestion.algorithm === 'CUBIC';
      const factor = isCubic ? 0.7 : 0.5;
      const expectedSsthresh = Math.max(2, Math.floor(state.congestion.wMax * factor));
      if (state.congestion.ssthresh !== expectedSsthresh) {
        return {
          ruleId: 'NET-3',
          invariantName: 'AIMD Multiplicative Decrease Factor',
          description: `ssthresh (${String(state.congestion.ssthresh)}) does not match expected ${isCubic ? 'CUBIC (0.7x)' : 'Reno (0.5x)'} multiplicative decrease factor of wMax (${String(state.congestion.wMax)}): expected ${String(expectedSsthresh)}`,
          affectedEntities: ['congestion'],
        };
      }
    }

    return undefined;
  }
}
