import type { DeterministicRNG } from '../../prng/deterministic-rng.js';
import {
  buildVnodesForNode,
  hrwLookup,
  jumpHash,
  jumpLabel,
  keyHash64,
  naiveLookup,
  ringLookup,
} from './consistent-hashing-algorithms.js';
import {
  CHASH_CAPS,
  type ConsistentHashingClusterState,
  type ConsistentHashingSimEvent,
  type KeyAssignments,
  type RebalanceMovement,
  type RingVnode,
} from './consistent-hashing-types.js';

const DEFAULT_NODE_IDS = ['node-A', 'node-B', 'node-C', 'node-D', 'node-E'];
const DEFAULT_VNODES = 100;
const DEFAULT_KEYS = 24;

export function buildRing(ringNodes: ReadonlyArray<{ id: string; vnodeCount: number }>): RingVnode[] {
  const vnodes: RingVnode[] = [];
  for (const node of ringNodes) {
    for (const v of buildVnodesForNode(node.id, node.vnodeCount)) {
      vnodes.push({ position: v.position, nodeId: node.id, vnodeIndex: v.vnodeIndex });
    }
  }
  vnodes.sort((a, b) => a.position - b.position);
  return vnodes;
}

export function computeAssignments(
  state: Pick<ConsistentHashingClusterState, 'ring' | 'ringNodes' | 'jumpBuckets'>,
  key: string,
  instrumentation?: {
    ringComparisons: number;
    hrwHashComputations: number;
    jumpLoopIterations: number;
  },
): KeyAssignments {
  const cmp = { count: 0 };
  const hrwOps = { count: 0 };
  const jumpIters = { count: 0 };

  const nodeIds = state.ringNodes.map((n) => n.id);
  const ring = ringLookup(state.ring, key, cmp);
  const hrw = hrwLookup(nodeIds, key, hrwOps);
  const jumpIdx = jumpHash(keyHash64(key), state.jumpBuckets, jumpIters);
  const jump = jumpLabel(jumpIdx, nodeIds);
  const naive = naiveLookup(key, nodeIds);

  if (instrumentation) {
    instrumentation.ringComparisons = cmp.count;
    instrumentation.hrwHashComputations = hrwOps.count;
    instrumentation.jumpLoopIterations = jumpIters.count;
  }

  return { ring, jump, hrw, naive };
}

function recomputeAllAssignments(nextState: ConsistentHashingClusterState): void {
  for (const key of nextState.keyOrder) {
    nextState.keyAssignments[key] = computeAssignments(nextState, key);
  }
}

function countMovement(
  before: Record<string, KeyAssignments>,
  after: Record<string, KeyAssignments>,
  scheme: keyof KeyAssignments,
): number {
  let moved = 0;
  for (const key of Object.keys(before)) {
    if (before[key]?.[scheme] !== after[key]?.[scheme]) {
      moved++;
    }
  }
  return moved;
}

function recordRebalance(
  nextState: ConsistentHashingClusterState,
  before: Record<string, KeyAssignments>,
  event: RebalanceMovement['event'],
  changedNodeId: string,
  nodeCountBefore: number,
): void {
  const movement: RebalanceMovement = {
    event,
    changedNodeId,
    ring: countMovement(before, nextState.keyAssignments, 'ring'),
    jump: countMovement(before, nextState.keyAssignments, 'jump'),
    hrw: countMovement(before, nextState.keyAssignments, 'hrw'),
    naive: countMovement(before, nextState.keyAssignments, 'naive'),
    totalKeys: nextState.keyOrder.length,
    nodeCountBefore,
    nodeCountAfter: nextState.ringNodes.length,
  };
  nextState.rebalanceEvents.push(movement);
  if (nextState.rebalanceEvents.length > CHASH_CAPS.maxRebalanceHistory) {
    nextState.rebalanceEvents.shift();
  }
  nextState.lastMovement = movement;
}

export function createDefaultConsistentHashingCluster(
  clusterId = 'consistent-hashing-1',
): ConsistentHashingClusterState {
  const ringNodes = DEFAULT_NODE_IDS.map((id) => ({ id, vnodeCount: DEFAULT_VNODES }));
  const ring = buildRing(ringNodes);

  const base: ConsistentHashingClusterState = {
    clusterId,
    tick: 0,
    ringNodes,
    ring,
    vnodesPerNode: DEFAULT_VNODES,
    jumpBuckets: DEFAULT_NODE_IDS.length,
    keyOrder: [],
    keyAssignments: {},
    rebalanceEvents: [],
    lastMovement: null,
    lookupStats: { ringComparisons: 0, hrwHashComputations: 0, jumpLoopIterations: 0 },
    lastLookup: null,
  };

  for (let i = 0; i < DEFAULT_KEYS; i++) {
    const key = `key-${i}`;
    base.keyOrder.push(key);
    base.keyAssignments[key] = computeAssignments(base, key);
  }

  return base;
}

export function pureConsistentHashingTransition(
  state: ConsistentHashingClusterState,
  event: ConsistentHashingSimEvent,
  rng: DeterministicRNG,
): { nextState: ConsistentHashingClusterState; emittedEvents: ConsistentHashingSimEvent[] } {
  const nextState: ConsistentHashingClusterState = JSON.parse(
    JSON.stringify(state),
  ) as ConsistentHashingClusterState;
  nextState.tick = event.tick;

  switch (event.type) {
    case 'CHASH_ADD_KEY_BATCH': {
      for (const key of event.payload.keys.slice(0, CHASH_CAPS.maxKeyBatchSize)) {
        if (nextState.keyOrder.length >= CHASH_CAPS.maxKeys) break;
        if (nextState.keyAssignments[key] !== undefined) continue;
        nextState.keyOrder.push(key);
        nextState.keyAssignments[key] = computeAssignments(nextState, key);
      }
      break;
    }

    case 'CHASH_ADD_NODE': {
      const nodeId = event.payload.nodeId;
      if (nextState.ringNodes.length >= CHASH_CAPS.maxNodes) break;
      if (nextState.ringNodes.some((n) => n.id === nodeId)) break;

      const before = JSON.parse(JSON.stringify(nextState.keyAssignments)) as Record<
        string,
        KeyAssignments
      >;
      const nodeCountBefore = nextState.ringNodes.length;

      const effectiveVnodes = Math.min(
        nextState.vnodesPerNode,
        Math.max(
          1,
          Math.floor(CHASH_CAPS.maxRingPositions / (nextState.ringNodes.length + 1)),
        ),
      );
      nextState.ringNodes.push({ id: nodeId, vnodeCount: effectiveVnodes });
      nextState.ring = buildRing(nextState.ringNodes);

      // Jump: growth-only — the new node is a new bucket appended at the
      // end of the insertion-ordered node list.
      nextState.jumpBuckets = nextState.ringNodes.length;

      recomputeAllAssignments(nextState);
      recordRebalance(nextState, before, 'ADD_NODE', nodeId, nodeCountBefore);
      break;
    }

    case 'CHASH_REMOVE_NODE': {
      const nodeId = event.payload.nodeId;
      if (nextState.ringNodes.length <= 1) break;
      if (!nextState.ringNodes.some((n) => n.id === nodeId)) break;

      const before = JSON.parse(JSON.stringify(nextState.keyAssignments)) as Record<
        string,
        KeyAssignments
      >;
      const nodeCountBefore = nextState.ringNodes.length;

      nextState.ringNodes = nextState.ringNodes.filter((n) => n.id !== nodeId);
      nextState.ring = buildRing(nextState.ringNodes);

      // Jump: no native removal — shrink bucket count and full remap,
      // relabeled onto the surviving node order. This visible broad
      // remap IS jump hash's removal weakness vs. the ring.
      nextState.jumpBuckets = Math.max(1, nextState.ringNodes.length);

      recomputeAllAssignments(nextState);
      recordRebalance(nextState, before, 'REMOVE_NODE', nodeId, nodeCountBefore);
      break;
    }

    case 'CHASH_SET_VNODES': {
      const vnodesPerNode = Math.max(
        1,
        Math.min(
          CHASH_CAPS.maxVnodesPerNode,
          Math.floor(CHASH_CAPS.maxRingPositions / Math.max(1, nextState.ringNodes.length)),
          event.payload.vnodesPerNode,
        ),
      );
      if (vnodesPerNode === nextState.vnodesPerNode) break;

      const before = JSON.parse(JSON.stringify(nextState.keyAssignments)) as Record<
        string,
        KeyAssignments
      >;

      nextState.vnodesPerNode = vnodesPerNode;
      nextState.ringNodes = nextState.ringNodes.map((n) => ({
        id: n.id,
        vnodeCount: vnodesPerNode,
      }));
      nextState.ring = buildRing(nextState.ringNodes);
      recomputeAllAssignments(nextState);
      recordRebalance(nextState, before, 'VNODE_RESIZE', 'all', nextState.ringNodes.length);
      break;
    }

    case 'CHASH_SET_JUMP_BUCKETS': {
      const buckets = Math.max(
        1,
        Math.min(CHASH_CAPS.maxNodes, event.payload.buckets),
      );
      if (buckets === nextState.jumpBuckets) break;

      const before = JSON.parse(JSON.stringify(nextState.keyAssignments)) as Record<
        string,
        KeyAssignments
      >;

      nextState.jumpBuckets = buckets;
      recomputeAllAssignments(nextState);
      recordRebalance(nextState, before, 'JUMP_RESIZE', 'jump-config', nextState.ringNodes.length);
      break;
    }

    case 'CHASH_LOOKUP': {
      const key = event.payload.key;
      const instrument = {
        ringComparisons: 0,
        hrwHashComputations: 0,
        jumpLoopIterations: 0,
      };
      const assignments = computeAssignments(nextState, key, instrument);
      nextState.lookupStats = {
        ringComparisons: instrument.ringComparisons,
        hrwHashComputations: instrument.hrwHashComputations,
        jumpLoopIterations: instrument.jumpLoopIterations,
      };
      nextState.lastLookup = {
        key,
        ring: assignments.ring,
        jump: assignments.jump,
        hrw: assignments.hrw,
      };
      break;
    }

    case 'TICK' as any:
    case 'CHASH_TICK': {
      // Heartbeat: assignments are event-driven; ticks advance counters only.
      break;
    }
  }

  nextState.rngState = rng.getState();
  return { nextState, emittedEvents: [] };
}
