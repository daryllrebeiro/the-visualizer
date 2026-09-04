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
