import type { DistributedLockClusterState } from './distributed-lock-types.js';

export interface LockInvariantViolation {
  ruleId: 'LOCK-1' | 'LOCK-2' | 'LOCK-3' | 'LOCK-4';
  invariantName: string;
  description: string;
  isPedagogicalFlaw?: boolean;
  pedagogicalNote?: string;
  affectedEntities: string[];
}

export class DistributedLockInvariantChecker {
  public check(state: DistributedLockClusterState): LockInvariantViolation | undefined {
    // LOCK-1: Fencing Enforcement
    if (state.flawsDemonstrated.dataCorruptedWithoutFencing) {
      return {
        ruleId: 'LOCK-1',
        invariantName: 'Fencing Enforcement Violation',
        description:
          'Downstream protected resource accepted out-of-order write from stale client without fencing token validation',
        affectedEntities: ['protectedResource'],
      };
    }

    // LOCK-3: Lease Liveness on Nodes
    for (const [nodeId, node] of Object.entries(state.nodes)) {
      if (node.heldByClient && node.expiresAtTick < state.tick) {
        return {
          ruleId: 'LOCK-3',
          invariantName: 'Lease Liveness Violation',
          description: `Node ${nodeId} still holds expired lease for client ${node.heldByClient} past tick ${node.expiresAtTick}`,
          affectedEntities: [nodeId],
        };
      }
    }

    // LOCK-4: Naive Mutual Exclusion (Intentionally-Violable Pedagogical Flaw)
    if (state.flawsDemonstrated.mutualExclusionViolated) {
      return {
        ruleId: 'LOCK-4',
        invariantName: 'Naive Mutual Exclusion Hazard (Kleppmann GC Pause)',
        description:
          'Multiple clients simultaneously believe they hold the lock following an unannounced client GC pause',
        isPedagogicalFlaw: true,
        pedagogicalNote:
          'Kleppmann (2016) demonstrated that locks relying on physical clock expiry cannot guarantee mutual exclusion if a client experiences a GC pause or process suspension. Safety must be enforced downstream via strictly monotonic fencing tokens (LOCK-1).',
        affectedEntities: Object.keys(state.clients),
      };
    }

    return undefined;
  }
}
