import type { DBClusterState } from './db-types.js';

export interface DBInvariantViolation {
  ruleId: string;
  invariantName: string;
  description: string;
  affectedNodeIds: string[];
}

export class DBInvariantChecker {
  public check(state: DBClusterState): DBInvariantViolation | undefined {
    // 1. Ring token sort ordering & uniqueness
    const inv1 = this.checkRingOrdering(state);
    if (inv1) return inv1;

    // 2. Node state consistency
    const inv2 = this.checkNodeStates(state);
    if (inv2) return inv2;

    // 3. Quorum overlap (DB-2: R + W > N)
    const inv3 = this.checkQuorumOverlap(state);
    if (inv3) return inv3;

    return undefined;
  }

  public checkQuorumOverlap(state: DBClusterState): DBInvariantViolation | undefined {
    const getCount = (level: string, rf: number): number => {
      switch (level) {
        case 'ONE':
          return 1;
        case 'TWO':
          return Math.min(2, rf);
        case 'THREE':
          return Math.min(3, rf);
        case 'ALL':
          return rf;
        case 'QUORUM':
        case 'LOCAL_QUORUM':
        case 'EACH_QUORUM':
        default:
          return Math.floor(rf / 2) + 1;
      }
    };

    const r = getCount(state.readConsistency, state.replicationFactor);
    const w = getCount(state.writeConsistency, state.replicationFactor);
    if (r + w <= state.replicationFactor) {
      return {
        ruleId: 'DB-2',
        invariantName: 'Quorum Overlap (R + W > N)',
        description: `Insufficient quorum overlap: R (${r}) + W (${w}) <= N (${state.replicationFactor}). Eventual consistency only.`,
        affectedNodeIds: Object.keys(state.nodes),
      };
    }
    return undefined;
  }

  private checkRingOrdering(state: DBClusterState): DBInvariantViolation | undefined {
    for (let i = 1; i < state.ringTokens.length; i++) {
      const prev = state.ringTokens[i - 1]!;
      const curr = state.ringTokens[i]!;

      if (curr.token < prev.token) {
        return {
          ruleId: 'DB_RING_ORDERING',
          invariantName: 'Token Ring Monotonicity',
          description: `Token ring disordered: token ${String(curr.token)} (node ${curr.nodeId}) appears after token ${String(prev.token)} (node ${prev.nodeId})`,
          affectedNodeIds: [prev.nodeId, curr.nodeId],
        };
      }
    }
    return undefined;
  }

  private checkNodeStates(state: DBClusterState): DBInvariantViolation | undefined {
    const nodes = Object.values(state.nodes);
    for (const node of nodes) {
      if (node.tokens.length === 0 && node.status === 'ALIVE') {
        return {
          ruleId: 'DB_ORPHAN_NODE',
          invariantName: 'Node Token Allocation',
          description: `Active node ${node.id} has 0 assigned tokens on the consistent hash ring`,
          affectedNodeIds: [node.id],
        };
      }
    }
    return undefined;
  }
}
