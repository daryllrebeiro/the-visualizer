/**
 * Consistent Hashing Deep-Dive Simulation Types & State Model
 *
 * Side-by-side comparison of three real consistent-hashing algorithms
 * plus the naive hash % N baseline:
 *
 * References:
 * - Karger et al. (1997): Consistent Hashing and Random Trees (STOC '97)
 * - Lamping & Veach (2014): A Fast, Minimal Memory, Consistent Hashing
 *   Algorithm (arXiv:1406.2294) — Jump Consistent Hash
 * - Thaler & Ravishankar (1996): Using Name-Based Mappings to Increase
 *   Hit Rates — Rendezvous / Highest Random Weight (HRW) hashing
 * - DeCandia et al. (2007): Dynamo (SOSP '07) — virtual nodes
 *
 * Ring space is 2^32 (positions stored as uint32). All assignment math is
 * integer-only (no floats in hashed state), except Jump Hash's internal
 * IEEE-754 double division, which is ECMAScript-spec-exact.
 */

import type { DeterministicRNG } from '../../prng/deterministic-rng.js';

export interface RingNode {
  id: string;
  vnodeCount: number;
}

export interface RingVnode {
  /** uint32 position on the ring, sorted ascending */
  position: number;
  nodeId: string;
  /** vnode ordinal within its physical node */
  vnodeIndex: number;
}

export interface KeyAssignments {
  /** ring: first vnode at-or-after key hash (wrap-around) */
  ring: string;
  /** jump consistent hash bucket index, relabeled to node ids */
  jump: string;
  /** rendezvous / HRW winner node id */
  hrw: string;
  /** naive hash % N baseline */
  naive: string;
}

export interface RebalanceMovement {
  event: 'ADD_NODE' | 'REMOVE_NODE' | 'VNODE_RESIZE' | 'JUMP_RESIZE';
  changedNodeId: string;
  ring: number;
  jump: number;
  hrw: number;
  naive: number;
  totalKeys: number;
  nodeCountBefore: number;
  nodeCountAfter: number;
}

export interface LookupInstrumentation {
  /** binary-search comparisons for the last ring lookup (O(log vN)) */
  ringComparisons: number;
  /** hash computations for the last HRW lookup (O(N)) */
  hrwHashComputations: number;
  /** loop iterations for the last jump lookup */
  jumpLoopIterations: number;
}

export interface ConsistentHashingClusterState {
  clusterId: string;
  tick: number;
  rngState?: number;
  ringNodes: RingNode[];
  /** all vnodes sorted ascending by position */
  ring: RingVnode[];
  /** default vnode count per physical node (CHASH-2 knob) */
  vnodesPerNode: number;
  /**
   * Jump bucket count; synced to node count on node add/remove.
   * ringNodes (insertion-ordered) doubles as the stable bucket->node
   * order for Jump Hash (append on add; splice+remap on remove — the
   * documented shrink+remap limitation of jump hash) and the naive
   * hash % N baseline.
   */
  jumpBuckets: number;
  /** keys in insertion order (iteration determinism) */
  keyOrder: string[];
  /** per-key assignments under all 4 schemes */
  keyAssignments: Record<string, KeyAssignments>;
  rebalanceEvents: RebalanceMovement[];
  lastMovement: RebalanceMovement | null;
  lookupStats: LookupInstrumentation;
  lastLookup: { key: string; ring: string; jump: string; hrw: string } | null;
}

export type ConsistentHashingSimEvent =
  | {
      id: string;
      tick: number;
      type: 'CHASH_TICK';
      payload: Record<string, unknown>;
    }
  | {
      id: string;
      tick: number;
      type: 'CHASH_ADD_KEY_BATCH';
      payload: { keys: string[] };
    }
  | {
      id: string;
      tick: number;
      type: 'CHASH_ADD_NODE';
      payload: { nodeId: string };
    }
  | {
      id: string;
      tick: number;
      type: 'CHASH_REMOVE_NODE';
      payload: { nodeId: string };
    }
  | {
      id: string;
      tick: number;
      type: 'CHASH_SET_VNODES';
      payload: { vnodesPerNode: number };
    }
  | {
      id: string;
      tick: number;
      type: 'CHASH_SET_JUMP_BUCKETS';
      payload: { buckets: number };
    }
  | {
      id: string;
      tick: number;
      type: 'CHASH_LOOKUP';
      payload: { key: string };
    };

/** Resource caps (hard-clamped in reducer, surfaced in UI when hit). */
export const CHASH_CAPS = {
  maxKeys: 50_000,
  maxNodes: 32,
  maxVnodesPerNode: 512,
  maxRingPositions: 16_384,
  maxRebalanceHistory: 50,
  maxKeyBatchSize: 1_000,
} as const;

export interface ConsistentHashingRngDeps {
  rng: DeterministicRNG;
}
