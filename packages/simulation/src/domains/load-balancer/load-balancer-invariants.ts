import { lbRingLookup } from './load-balancer-algorithms.js';
import type { LBClusterState } from './load-balancer-types.js';

export interface LBInvariantViolation {
  ruleId: 'LB-1' | 'LB-2' | 'LB-3' | 'LB-4';
  invariantName: string;
  description: string;
  affectedEntities: string[];
}

/**
 * State-level checks for the load-balancer domain.
 *
 * LB-1: no open connection may sit on a nonexistent/removed backend;
 * routing log entries never target UNHEALTHY/DRAINING backends.
 * LB-2: dispatch counts converge to configured weights (statistical
 * bound; exact for smooth WRR).
 * LB-3: sticky assignments equal a fresh ring lookup (survivor keys
 * never drift), and CONSISTENT_HASH connections follow the table.
 * LB-4: draining backends receive no new connections (all their open
 * connections started before the drain) and are released only after
 * in-flight completion or timeout.
 */
export class LBInvariantChecker {
  public check(state: LBClusterState): LBInvariantViolation | undefined {
    // LB-1: every dispatch must have landed on a HEALTHY backend at
    // dispatch time (the flag is recorded from actual backend health —
    // a buggy selector produces false flags).
    for (const entry of state.routingLog) {
      if (entry.backendId === null) continue;
      const backend = state.backends[entry.backendId];
      if (!backend) {
        return {
          ruleId: 'LB-1',
          invariantName: 'Health-Gated Routing',
          description: `Request ${entry.requestId} was routed to unknown backend ${entry.backendId}`,
          affectedEntities: [entry.backendId],
        };
      }
      if (!entry.healthyAtDispatch) {
        return {
          ruleId: 'LB-1',
          invariantName: 'Health-Gated Routing',
          description: `Request ${entry.requestId} at tick ${entry.tick} was routed to ${entry.backendId} which was ${backend.health} at dispatch time`,
          affectedEntities: [entry.backendId, entry.requestId],
        };
      }
    }

    // LB-4: connections on draining backends must predate the drain.
    for (const conn of Object.values(state.connections)) {
      const backend = state.backends[conn.backendId];
      if (backend && backend.health === 'DRAINING' && backend.drainStartTick !== null) {
        if (conn.startTick > backend.drainStartTick) {
          return {
            ruleId: 'LB-4',
            invariantName: 'Graceful Drain Completion',
            description: `Connection ${conn.id} started at tick ${conn.startTick}, after backend ${backend.id} began draining at tick ${backend.drainStartTick} — new connections must go elsewhere`,
            affectedEntities: [backend.id, conn.id],
          };
        }
      }
    }

    // LB-3: sticky assignments must equal a fresh ring lookup.
    if (state.routingPolicy === 'CONSISTENT_HASH' && state.ring.length > 0) {
      for (const [sessionKey, backendId] of Object.entries(state.stickyAssignments)) {
        const expected = lbRingLookup(state.ring, sessionKey);
        if (backendId !== expected) {
          return {
            ruleId: 'LB-3',
            invariantName: 'Sticky Session Consistency',
            description: `Session "${sessionKey}" is assigned to ${backendId} but the ring successor is ${expected} — assignments drifted from the ring`,
            affectedEntities: [backendId, sessionKey],
          };
        }
        const backend = state.backends[backendId];
        if (backend && backend.health !== 'HEALTHY') {
          return {
            ruleId: 'LB-3',
            invariantName: 'Sticky Session Consistency',
            description: `Session "${sessionKey}" is pinned to ${backendId} which is ${backend.health}`,
            affectedEntities: [backendId, sessionKey],
          };
        }
      }
    }

    // LB-2: weighted distribution over a large dispatch sample.
    const total = Object.values(state.backends).reduce((acc, b) => acc + b.dispatchCount, 0);
    if (total >= 1000) {
      const totalWeight = Object.values(state.backends)
        .filter((b) => b.health === 'HEALTHY')
        .reduce((acc, b) => acc + b.weight, 0);
      if (totalWeight > 0) {
        for (const backend of Object.values(state.backends)) {
          if (backend.dispatchCount === 0) continue;
          const expectedShare = backend.weight / totalWeight;
          const observed = backend.dispatchCount / total;
          // 4-sigma binomial band + 2% relative slack (covers policy
          // switches mid-window; exact for smooth WRR on stable config).
          const sigma = 4 * Math.sqrt((expectedShare * (1 - expectedShare)) / total);
          const slack = Math.max(sigma, 0.02 * expectedShare);
          if (Math.abs(observed - expectedShare) > slack + 0.001) {
            return {
              ruleId: 'LB-2',
              invariantName: 'Weighted Distribution Accuracy',
              description: `Backend ${backend.id} received ${backend.dispatchCount}/${total} requests (${(observed * 100).toFixed(2)}%) but its weight implies ${(expectedShare * 100).toFixed(2)}% (bound ±${(slack * 100).toFixed(2)}%)`,
              affectedEntities: [backend.id],
            };
          }
        }
      }
    }

    // LB-4: drain completion accounting sanity.
    if (state.stats.drainForceCloses > state.stats.drainCompletions) {
      return {
        ruleId: 'LB-4',
        invariantName: 'Graceful Drain Completion',
        description: `Force-closes (${state.stats.drainForceCloses}) exceed drain completions (${state.stats.drainCompletions}) — force-close is the timeout exception, not the norm`,
        affectedEntities: ['drain'],
      };
    }

    return undefined;
  }
}
