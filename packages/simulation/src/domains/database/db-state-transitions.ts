import { DeterministicRNG } from '../../prng/deterministic-rng.js';
import type {
  ConsistencyLevel,
  DBClusterState,
  DBNode,
  DBSimEvent,
  DBValueRecord,
  HintedHandoffRecord,
} from './db-types.js';
import { ConsistentHashRing, type RingToken } from './hash-ring.js';

export interface DBTransitionResult {
  nextState: DBClusterState;
  emittedEvents: DBSimEvent[];
}

const NODE_COLORS = ['#38bdf8', '#34d399', '#fbbf24', '#f43f5e', '#a855f7', '#fb923c'];

export function createDefaultDBCluster(
  clusterId = 'db-cluster-1',
  nodeCount = 4,
  replicationFactor = 3,
): DBClusterState {
  const ring = new ConsistentHashRing(3);
  const nodes: Record<string, DBNode> = {};

  for (let i = 1; i <= nodeCount; i++) {
    const id = String(i);
    ring.addNode(id);
    nodes[id] = {
      id,
      host: `node-${id}.db.local`,
      status: 'ALIVE',
      tokens: [],
      storage: {},
      hints: [],
      color: NODE_COLORS[(i - 1) % NODE_COLORS.length] ?? '#38bdf8',
    };
  }

  const ringTokens: RingToken[] = [...ring.getRingTokens()];
  for (const token of ringTokens) {
    nodes[token.nodeId]?.tokens.push(token.token);
  }

  return {
    clusterId,
    tick: 0,
    rngState: 42,
    fidelityMode: 'TEXTBOOK',
    vnodesPerNode: 3,
    hintedHandoffEnabled: true,
    replicationFactor,
    writeConsistency: 'QUORUM',
    readConsistency: 'QUORUM',
    nodes,
    ringTokens,
    totalOperations: 0,
    staleReadsObserved: 0,
    readRepairsCompleted: 0,
  };
}

export function pureDBTransition(
  state: DBClusterState,
  event: DBSimEvent,
  rng: DeterministicRNG,
): DBTransitionResult {
  const nextState: DBClusterState = JSON.parse(JSON.stringify(state)) as DBClusterState;
  const emittedEvents: DBSimEvent[] = [];

  nextState.tick = event.tick;

  switch (event.type) {
    case 'DB_WRITE_REQUEST':
      handleWriteRequest(nextState, event, emittedEvents);
      break;
    case 'DB_READ_REQUEST':
      handleReadRequest(nextState, event, rng, emittedEvents);
      break;
    case 'DB_READ_REPAIR':
      handleReadRepair(nextState, event);
      break;
    case 'DB_NODE_JOIN':
      handleNodeJoin(nextState, event);
      break;
    case 'DB_NODE_LEAVE':
      handleNodeLeave(nextState, event);
      break;
    case 'DB_NODE_CRASH':
      handleNodeCrash(nextState, event);
      break;
    case 'DB_NODE_RECOVER':
      handleNodeRecover(nextState, event, emittedEvents);
      break;
    case 'DB_HINT_DELIVER':
      handleHintDeliver(nextState, event);
      break;
    case 'DB_UPDATE_CONSISTENCY':
      handleUpdateConsistency(nextState, event);
      break;
    case 'DB_CONFIGURE_FIDELITY': {
      if (event.payload['fidelityMode'] !== undefined) {
        nextState.fidelityMode = event.payload['fidelityMode'] as 'TEXTBOOK' | 'REALISTIC';
      }
      if (event.payload['hintedHandoffEnabled'] !== undefined) {
        nextState.hintedHandoffEnabled = Boolean(event.payload['hintedHandoffEnabled']);
      }
      if (event.payload['vnodesPerNode'] !== undefined) {
        const vnodes = Number(event.payload['vnodesPerNode']);
        nextState.vnodesPerNode = vnodes;
        const ring = new ConsistentHashRing(vnodes);
        for (const nId of Object.keys(nextState.nodes)) {
          ring.addNode(nId);
        }
        nextState.ringTokens = [...ring.getRingTokens()];
        for (const n of Object.values(nextState.nodes)) {
          n.tokens = [];
        }
        for (const token of nextState.ringTokens) {
          nextState.nodes[token.nodeId]?.tokens.push(token.token);
        }
      }
      break;
    }
  }

  nextState.rngState = rng.getState();
  return { nextState, emittedEvents };
}

function getRequiredCount(level: ConsistencyLevel, replicationFactor: number): number {
  switch (level) {
    case 'ONE':
      return 1;
    case 'TWO':
      return Math.min(2, replicationFactor);
    case 'THREE':
      return Math.min(3, replicationFactor);
    case 'ALL':
      return replicationFactor;
    case 'QUORUM':
    case 'LOCAL_QUORUM':
    case 'EACH_QUORUM':
    default:
      return Math.floor(replicationFactor / 2) + 1;
  }
}

function handleWriteRequest(
  state: DBClusterState,
  event: DBSimEvent,
  emittedEvents: DBSimEvent[],
): void {
  const key = String(event.payload['key'] ?? '');
  const value = String(event.payload['value'] ?? '');
  const consistency =
    (event.payload['consistencyLevel'] as ConsistencyLevel | undefined) ?? state.writeConsistency;

  if (!key) return;

  const ring = new ConsistentHashRing(3);
  ring.setRingTokens(state.ringTokens);

  const { replicaNodeIds } = ring.findReplicas(key, state.replicationFactor);
  const requiredAcks = getRequiredCount(consistency, state.replicationFactor);

  // Determine coordinator (first alive replica or first node)
  const coordinatorId = replicaNodeIds.find((id) => state.nodes[id]?.status === 'ALIVE') ?? '1';
  const coordinator = state.nodes[coordinatorId];

  let currentVersion = 0;
  for (const nId of replicaNodeIds) {
    const existing = state.nodes[nId]?.storage[key];
    if (existing && existing.version > currentVersion) {
      currentVersion = existing.version;
    }
  }

  const newVersion = currentVersion + 1;
  const newRecord: DBValueRecord = {
    key,
    value,
    version: newVersion,
    timestamp: state.tick,
    vectorClock: { [coordinatorId]: newVersion },
    deleted: false,
  };

  let ackCount = 0;
  for (const nId of replicaNodeIds) {
    const node = state.nodes[nId];
    if (node && node.status === 'ALIVE') {
      node.storage[key] = JSON.parse(JSON.stringify(newRecord)) as DBValueRecord;
      ackCount++;
    } else if (state.hintedHandoffEnabled && coordinator && node && node.status === 'DOWN') {
      // Store hinted handoff on coordinator
      const hint: HintedHandoffRecord = {
        targetNodeId: nId,
        key,
        record: newRecord,
        storedAtTick: state.tick,
      };
      coordinator.hints.push(hint);
    }
  }

  if (ackCount >= requiredAcks) {
    state.totalOperations++;
    emittedEvents.push({
      id: `write-ack-${key}-${String(state.tick)}`,
      tick: state.tick + 1,
      type: 'DB_WRITE_ACK',
      payload: { key, version: newVersion, acks: ackCount, requiredAcks },
    });
  }
}

function handleReadRequest(
  state: DBClusterState,
  event: DBSimEvent,
  rng: DeterministicRNG,
  emittedEvents: DBSimEvent[],
): void {
  const key = String(event.payload['key'] ?? '');
  const consistency =
    (event.payload['consistencyLevel'] as ConsistencyLevel | undefined) ?? state.readConsistency;

  if (!key) return;

  const ring = new ConsistentHashRing(3);
  ring.setRingTokens(state.ringTokens);

  const { replicaNodeIds } = ring.findReplicas(key, state.replicationFactor);
  const requiredReads = getRequiredCount(consistency, state.replicationFactor);

  const aliveReplicas = replicaNodeIds.filter((id) => state.nodes[id]?.status === 'ALIVE');
  if (aliveReplicas.length === 0) return;

  // Sample R replicas using deterministic shuffle
  const shuffled = rng.shuffle([...aliveReplicas]);
  const sampledIds = shuffled.slice(0, Math.min(requiredReads, shuffled.length));

  const sampledRecords: DBValueRecord[] = [];
  for (const nId of sampledIds) {
    const record = state.nodes[nId]?.storage[key];
    if (record) sampledRecords.push(record);
  }

  // Find latest among sampled replicas
  let highestSampledVersion = 0;
  let latestSampledRecord: DBValueRecord | null = null;
  for (const rec of sampledRecords) {
    if (rec.version > highestSampledVersion) {
      highestSampledVersion = rec.version;
      latestSampledRecord = rec;
    }
  }

  // Find highest version across ALL actual alive replicas to check for stale read
  let absoluteHighestVersion = 0;
  for (const nId of aliveReplicas) {
    const rec = state.nodes[nId]?.storage[key];
    if (rec && rec.version > absoluteHighestVersion) {
      absoluteHighestVersion = rec.version;
    }
  }

  // If highest version among sampled is less than cluster latest -> Stale Read Observed!
  if (highestSampledVersion < absoluteHighestVersion) {
    state.staleReadsObserved++;
  }

  // Trigger Read Repair if any sampled replica is out of date
  if (latestSampledRecord) {
    const staleSampledNodeIds = sampledIds.filter((nId) => {
      const rec = state.nodes[nId]?.storage[key];
      return !rec || rec.version < highestSampledVersion;
    });

    if (staleSampledNodeIds.length > 0) {
      emittedEvents.push({
        id: `read-repair-${key}-${String(state.tick)}`,
        tick: state.tick + 1,
        type: 'DB_READ_REPAIR',
        payload: {
          key,
          record: latestSampledRecord,
          targetNodeIds: staleSampledNodeIds,
        },
      });
    }
  }

  state.totalOperations++;
}

function handleReadRepair(state: DBClusterState, event: DBSimEvent): void {
  const key = String(event.payload['key'] ?? '');
  const record = event.payload['record'] as DBValueRecord | undefined;
  const targetNodeIds = (event.payload['targetNodeIds'] as string[] | undefined) ?? [];

  if (!key || !record) return;

  for (const nId of targetNodeIds) {
    const node = state.nodes[nId];
    if (node && node.status === 'ALIVE') {
      node.storage[key] = JSON.parse(JSON.stringify(record)) as DBValueRecord;
      state.readRepairsCompleted++;
    }
  }
}

function handleNodeJoin(state: DBClusterState, event: DBSimEvent): void {
  const nodeId = String(event.payload['nodeId'] ?? String(Object.keys(state.nodes).length + 1));
  if (state.nodes[nodeId]) return;

  const ring = new ConsistentHashRing(3);
  ring.setRingTokens(state.ringTokens);
  ring.addNode(nodeId);

  const newTokens: number[] = [];
  for (const item of ring.getRingTokens()) {
    if (item.nodeId === nodeId) newTokens.push(item.token);
  }

  state.nodes[nodeId] = {
    id: nodeId,
    host: `node-${nodeId}.db.local`,
    status: 'ALIVE',
    tokens: newTokens,
    storage: {},
    hints: [],
    color: NODE_COLORS[(parseInt(nodeId, 10) - 1) % NODE_COLORS.length] ?? '#38bdf8',
  };

  state.ringTokens = [...ring.getRingTokens()];

  // Rebalance: copy keys responsible under new tokens
  const existingNodes = Object.values(state.nodes) as DBNode[];
  for (const existingNode of existingNodes) {
    if (existingNode.id === nodeId) continue;
    for (const [key, record] of Object.entries(existingNode.storage)) {
      const { replicaNodeIds } = ring.findReplicas(key, state.replicationFactor);
      if (replicaNodeIds.includes(nodeId)) {
        state.nodes[nodeId].storage[key] = JSON.parse(JSON.stringify(record)) as DBValueRecord;
      }
    }
  }
}

function handleNodeLeave(state: DBClusterState, event: DBSimEvent): void {
  const nodeId = String(event.payload['nodeId'] ?? '');
  if (!state.nodes[nodeId]) return;

  const ring = new ConsistentHashRing(3);
  ring.setRingTokens(state.ringTokens);
  ring.removeNode(nodeId);

  state.ringTokens = [...ring.getRingTokens()];
  delete state.nodes[nodeId];
}

function handleNodeCrash(state: DBClusterState, event: DBSimEvent): void {
  const nodeId = String(event.payload['nodeId'] ?? '');
  const node = state.nodes[nodeId];
  if (node) {
    node.status = 'DOWN';
  }
}

function handleNodeRecover(
  state: DBClusterState,
  event: DBSimEvent,
  emittedEvents: DBSimEvent[],
): void {
  const nodeId = String(event.payload['nodeId'] ?? '');
  const node = state.nodes[nodeId];
  if (node) {
    node.status = 'ALIVE';

    // Flush hinted handoffs stored across other nodes
    emittedEvents.push({
      id: `deliver-hints-${nodeId}-${String(state.tick)}`,
      tick: state.tick + 1,
      type: 'DB_HINT_DELIVER',
      payload: { targetNodeId: nodeId },
    });
  }
}

function handleHintDeliver(state: DBClusterState, event: DBSimEvent): void {
  const targetNodeId = String(event.payload['targetNodeId'] ?? '');
  const targetNode = state.nodes[targetNodeId];
  if (!targetNode || targetNode.status !== 'ALIVE') return;

  const sourceNodes = Object.values(state.nodes) as DBNode[];
  for (const sourceNode of sourceNodes) {
    if (sourceNode.id === targetNodeId) continue;
    const remainingHints: HintedHandoffRecord[] = [];

    for (const hint of sourceNode.hints) {
      if (hint.targetNodeId === targetNodeId) {
        const existing = targetNode.storage[hint.key];
        if (!existing || existing.version < hint.record.version) {
          targetNode.storage[hint.key] = JSON.parse(JSON.stringify(hint.record)) as DBValueRecord;
        }
      } else {
        remainingHints.push(hint);
      }
    }
    sourceNode.hints = remainingHints;
  }
}

function handleUpdateConsistency(state: DBClusterState, event: DBSimEvent): void {
  if (event.payload['readConsistency']) {
    state.readConsistency = event.payload['readConsistency'] as ConsistencyLevel;
  }
  if (event.payload['writeConsistency']) {
    state.writeConsistency = event.payload['writeConsistency'] as ConsistencyLevel;
  }
}
