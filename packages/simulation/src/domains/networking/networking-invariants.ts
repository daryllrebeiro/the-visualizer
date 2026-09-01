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

    return undefined;
  }
}
