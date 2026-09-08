import {
  hrwLookup,
  jumpHash,
  jumpLabel,
  keyHash64,
  naiveLookup,
  ringLookup,
} from './consistent-hashing-algorithms.js';
import type { ConsistentHashingClusterState } from './consistent-hashing-types.js';

export interface ConsistentHashingInvariantViolation {
  ruleId: 'CHASH-1' | 'CHASH-2' | 'CHASH-3' | 'CHASH-4';
  invariantName: string;
  description: string;
  affectedEntities: string[];
}

/**
 * State-level consistency checks for the consistent-hashing domain.
 *
 * The checker recomputes every key's assignment under all four schemes
 * from the state's own ring/node configuration and flags drift, plus
 * verifies movement bounds on the last rebalance event. Behavioral
 * properties (growth consistency, distribution quality) are exercised
 * exhaustively in consistent-hashing.fidelity.test.ts.
 */
export class ConsistentHashingInvariantChecker {
  public check(state: ConsistentHashingClusterState): ConsistentHashingInvariantViolation | undefined {
    const nodeIds = state.ringNodes.map((n) => n.id);

    // CHASH-4a: Rendezvous determinism — stored assignment must equal a
    // fresh recomputation from node identity alone (no ring state needed).
    for (const key of state.keyOrder) {
      const stored = state.keyAssignments[key];
      if (!stored) {
        return {
          ruleId: 'CHASH-4',
          invariantName: 'Rendezvous Determinism Without Ring State',
          description: `Key ${key} has no assignment record`,
          affectedEntities: [key],
        };
      }
      const expectedHrw = hrwLookup(nodeIds, key);
      if (stored.hrw !== expectedHrw) {
        return {
          ruleId: 'CHASH-4',
          invariantName: 'Rendezvous Determinism Without Ring State',
          description: `Key ${key} stored HRW assignment ${stored.hrw} but recomputed argmax is ${expectedHrw} — assignments drifted from node identities`,
          affectedEntities: [key, stored.hrw],
        };
      }
      const expectedRing = state.ring.length > 0 ? ringLookup(state.ring, key) : stored.ring;
      if (state.ring.length > 0 && stored.ring !== expectedRing) {
        return {
          ruleId: 'CHASH-4',
          invariantName: 'Ring Assignment Consistency',
          description: `Key ${key} stored ring assignment ${stored.ring} but recomputed successor vnode belongs to ${expectedRing}`,
          affectedEntities: [key, stored.ring],
        };
      }
      const expectedJump = jumpLabel(jumpHash(keyHash64(key), state.jumpBuckets), nodeIds);
      if (state.jumpBuckets <= nodeIds.length && stored.jump !== expectedJump) {
        return {
          ruleId: 'CHASH-4',
          invariantName: 'Jump Assignment Consistency',
          description: `Key ${key} stored jump assignment ${stored.jump} but recomputed bucket maps to ${expectedJump}`,
          affectedEntities: [key, stored.jump],
        };
      }
      const expectedNaive = naiveLookup(key, nodeIds);
      if (stored.naive !== expectedNaive) {
        return {
          ruleId: 'CHASH-4',
          invariantName: 'Naive Baseline Assignment Consistency',
          description: `Key ${key} stored naive assignment ${stored.naive} but hash % N recomputes to ${expectedNaive}`,
          affectedEntities: [key, stored.naive],
        };
      }
    }

    // CHASH-2: virtual-node load balance — with sufficient vnodes, the
    // ring key distribution must not be pathologically skewed.
    if (state.vnodesPerNode >= 100 && state.keyOrder.length >= 1000) {
      const loads = new Map<string, number>();
      for (const key of state.keyOrder) {
        const node = state.keyAssignments[key]?.ring;
        if (node) {
          loads.set(node, (loads.get(node) ?? 0) + 1);
        }
      }
      const counts = [...loads.values()];
      if (counts.length > 0) {
        const max = Math.max(...counts);
        const min = Math.min(...counts);
        const expectedShare = state.keyOrder.length / state.ringNodes.length;
        // Max/min ratio bound and a generous per-node deviation bound.
        if (max / Math.max(1, min) > 2.5 || max > expectedShare * 1.9) {
          return {
            ruleId: 'CHASH-2',
            invariantName: 'Virtual Node Load Balance',
            description: `Ring load skew: max=${max}, min=${min}, expected per node=${expectedShare.toFixed(1)} with ${state.vnodesPerNode} vnodes/node`,
            affectedEntities: state.ringNodes.map((n) => n.id),
          };
        }
      }
    }

    // CHASH-1: minimal disruption on node change — the last rebalance
    // event's ring/jump movement must be near K/N, never the naive-level
    // near-total reshuffle.
    const last = state.lastMovement;
    if (last && (last.event === 'ADD_NODE' || last.event === 'REMOVE_NODE')) {
      const n = Math.max(1, last.nodeCountAfter);
      const k = Math.max(1, last.totalKeys);
      const expectedShare = last.event === 'ADD_NODE' ? k / (n + 1) : k / n;
      // Statistical slack capped at 25% of K so small-K records cannot
      // hide a full reshuffle behind the sqrt term.
      const slack = Math.min(4 * Math.sqrt(k), 0.25 * k);
      const ringBound = 2.5 * expectedShare + slack;
      if (last.ring > ringBound) {
        return {
          ruleId: 'CHASH-1',
          invariantName: 'Minimal Disruption on Node Change',
          description: `Last ${last.event} moved ${last.ring}/${k} ring keys; consistent hashing requires ~${expectedShare.toFixed(1)} (bound ${ringBound.toFixed(1)})`,
          affectedEntities: [last.changedNodeId],
        };
      }
      if (last.naive <= last.ring && k >= 100) {
        return {
          ruleId: 'CHASH-1',
          invariantName: 'Minimal Disruption on Node Change (vs Naive Baseline)',
          description: `Naive hash % N moved ${last.naive} keys, ring moved ${last.ring} — naive should demonstrably reshuffle more than consistent hashing`,
          affectedEntities: [last.changedNodeId],
        };
      }
    }

    // CHASH-3: jump bucket count must stay in sync with node count.
    if (state.jumpBuckets < 1 || state.jumpBuckets > nodeIds.length) {
      return {
        ruleId: 'CHASH-3',
        invariantName: 'Jump Bucket Count Sanity',
        description: `jumpBuckets=${state.jumpBuckets} outside [1, ${nodeIds.length}] node count`,
        affectedEntities: ['jump-config'],
      };
    }

    return undefined;
  }
}
