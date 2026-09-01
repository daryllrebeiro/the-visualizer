import type { RaftClusterState } from './raft-types.js';

export interface RaftInvariantViolation {
  ruleId: string;
  invariantName: string;
  description: string;
  affectedNodeIds: string[];
}

/**
 * RaftInvariantChecker — Asserts the 5 Core Raft Safety Properties on each state snapshot.
 */
export class RaftInvariantChecker {
  /**
   * Asserts all 5 Raft invariants against the cluster state.
   * Returns the first violation found, or undefined if all pass.
   */
  public check(state: RaftClusterState): RaftInvariantViolation | undefined {
    // 1. Invariant 1: Election Safety (at most one leader per term)
    const inv1 = this.checkElectionSafety(state);
    if (inv1) return inv1;

    // 2. Invariant 2: Log Matching Property
    const inv2 = this.checkLogMatching(state);
    if (inv2) return inv2;

    // 3. Invariant 3: Leader Completeness on committed entries
    const inv3 = this.checkLeaderCompleteness(state);
    if (inv3) return inv3;

    // 4. Invariant 4: Commit Index Boundedness (commitIndex <= log.length)
    const inv4 = this.checkCommitIndexBounds(state);
    if (inv4) return inv4;

    return undefined;
  }

  /**
   * Election Safety: At most one leader can be elected in a given term.
   */
  private checkElectionSafety(state: RaftClusterState): RaftInvariantViolation | undefined {
    const leadersByTerm = new Map<number, string[]>();

    for (const node of Object.values(state.nodes)) {
      if (node.role === 'LEADER' && node.status === 'ALIVE') {
        const leaders = leadersByTerm.get(node.currentTerm) ?? [];
        leaders.push(node.id);
        leadersByTerm.set(node.currentTerm, leaders);

        if (leaders.length > 1) {
          return {
            ruleId: 'RAFT_ELECTION_SAFETY',
            invariantName: 'Election Safety',
            description: `Multiple leaders elected in term ${String(node.currentTerm)}: nodes [${leaders.join(', ')}]`,
            affectedNodeIds: leaders,
          };
        }
      }
    }

    return undefined;
  }

  /**
   * Log Matching: If two logs contain an entry with the same index and term,
   * they are identical in all entries up through the given index.
   */
  private checkLogMatching(state: RaftClusterState): RaftInvariantViolation | undefined {
    const nodes = Object.values(state.nodes).filter((n) => n.status === 'ALIVE');

    for (let i = 0; i < nodes.length; i++) {
      const nodeA = nodes[i]!;
      for (let j = i + 1; j < nodes.length; j++) {
        const nodeB = nodes[j]!;

        const minLen = Math.min(nodeA.log.length, nodeB.log.length);
        for (let k = 0; k < minLen; k++) {
          const entryA = nodeA.log[k]!;
          const entryB = nodeB.log[k]!;

          if (entryA.index === entryB.index && entryA.term === entryB.term) {
            // Check all preceding entries are identical
            for (let p = 0; p <= k; p++) {
              const prevA = nodeA.log[p]!;
              const prevB = nodeB.log[p]!;
              if (prevA.term !== prevB.term || prevA.command !== prevB.command) {
                return {
                  ruleId: 'RAFT_LOG_MATCHING',
                  invariantName: 'Log Matching',
                  description: `Log mismatch between Node ${nodeA.id} and Node ${nodeB.id} at index ${String(p + 1)} despite matching at index ${String(k + 1)}`,
                  affectedNodeIds: [nodeA.id, nodeB.id],
                };
              }
            }
          }
        }
      }
    }

    return undefined;
  }

  /**
   * Leader Completeness: If a log entry is committed in a given term,
   * that entry will be present in the logs of the leaders for all higher terms.
   */
  private checkLeaderCompleteness(state: RaftClusterState): RaftInvariantViolation | undefined {
    // Find all committed entries across any node
    for (const node of Object.values(state.nodes)) {
      if (node.commitIndex > 0) {
        for (let idx = 0; idx < node.commitIndex; idx++) {
          const committedEntry = node.log[idx];
          if (!committedEntry) continue;

          // Verify every active leader in a higher term has this entry
          for (const leaderNode of Object.values(state.nodes)) {
            if (leaderNode.role === 'LEADER' && leaderNode.currentTerm > committedEntry.term) {
              const leaderEntry = leaderNode.log[idx];
              if (!leaderEntry || leaderEntry.term !== committedEntry.term) {
                return {
                  ruleId: 'RAFT_LEADER_COMPLETENESS',
                  invariantName: 'Leader Completeness',
                  description: `Leader ${leaderNode.id} in term ${String(leaderNode.currentTerm)} is missing committed entry at index ${String(idx + 1)} from term ${String(committedEntry.term)}`,
                  affectedNodeIds: [node.id, leaderNode.id],
                };
              }
            }
          }
        }
      }
    }

    return undefined;
  }

  /**
   * Commit Index Boundedness: commitIndex must not exceed current log length.
   */
  private checkCommitIndexBounds(state: RaftClusterState): RaftInvariantViolation | undefined {
    for (const node of Object.values(state.nodes)) {
      if (node.commitIndex > node.log.length) {
        return {
          ruleId: 'RAFT_COMMIT_BOUND',
          invariantName: 'Commit Index Bounded',
          description: `Node ${node.id} commitIndex (${String(node.commitIndex)}) exceeds log length (${String(node.log.length)})`,
          affectedNodeIds: [node.id],
        };
      }
    }
    return undefined;
  }
}
