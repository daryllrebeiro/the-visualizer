import { DeterministicRNG } from '../../prng/deterministic-rng.js';
import { getClusterSlot } from './crc16.js';
import { evictUntilMemoryAvailable } from './redis-eviction.js';
import type {
  EvictionPolicy,
  RedisCacheEntry,
  RedisClusterState,
  RedisGetPayload,
  RedisNode,
  RedisReshardPayload,
  RedisSetPayload,
  RedisSimEvent,
} from './redis-types.js';

export interface RedisTransitionResult {
  nextState: RedisClusterState;
  emittedEvents: RedisSimEvent[];
}

export function createDefaultRedisCluster(clusterId = 'redis-cluster-1'): RedisClusterState {
  const nodes: Record<string, RedisNode> = {
    '1': {
      id: '1',
      host: '127.0.0.1',
      port: 7000,
      clusterBusPort: 17000,
      configEpoch: 1,
      role: 'MASTER',
      masterId: null,
      status: 'ALIVE',
      slotRanges: [{ startSlot: 0, endSlot: 5460 }],
      migratingSlots: [],
      importingSlots: [],
      memoryUsedBytes: 0,
      maxMemoryBytes: 512,
      storage: {},
      color: '#38bdf8',
    },
    '2': {
      id: '2',
      host: '127.0.0.1',
      port: 7001,
      clusterBusPort: 17001,
      configEpoch: 1,
      role: 'MASTER',
      masterId: null,
      status: 'ALIVE',
      slotRanges: [{ startSlot: 5461, endSlot: 10922 }],
      migratingSlots: [],
      importingSlots: [],
      memoryUsedBytes: 0,
      maxMemoryBytes: 512,
      color: '#34d399',
      storage: {},
    },
    '3': {
      id: '3',
      host: '127.0.0.1',
      port: 7002,
      clusterBusPort: 17002,
      configEpoch: 1,
      role: 'MASTER',
      masterId: null,
      status: 'ALIVE',
      slotRanges: [{ startSlot: 10923, endSlot: 16383 }],
      migratingSlots: [],
      importingSlots: [],
      memoryUsedBytes: 0,
      maxMemoryBytes: 512,
      color: '#fbbf24',
      storage: {},
    },
    '4': {
      id: '4',
      host: '127.0.0.1',
      port: 7003,
      clusterBusPort: 17003,
      configEpoch: 1,
      role: 'REPLICA',
      masterId: '1',
      status: 'ALIVE',
      slotRanges: [{ startSlot: 0, endSlot: 5460 }],
      migratingSlots: [],
      importingSlots: [],
      memoryUsedBytes: 0,
      maxMemoryBytes: 512,
      color: '#38bdf880',
      storage: {},
    },
    '5': {
      id: '5',
      host: '127.0.0.1',
      port: 7004,
      clusterBusPort: 17004,
      configEpoch: 1,
      role: 'REPLICA',
      masterId: '2',
      status: 'ALIVE',
      slotRanges: [{ startSlot: 5461, endSlot: 10922 }],
      migratingSlots: [],
      importingSlots: [],
      memoryUsedBytes: 0,
      maxMemoryBytes: 512,
      color: '#34d39980',
      storage: {},
    },
    '6': {
      id: '6',
      host: '127.0.0.1',
      port: 7005,
      clusterBusPort: 17005,
      configEpoch: 1,
      role: 'REPLICA',
      masterId: '3',
      status: 'ALIVE',
      slotRanges: [{ startSlot: 10923, endSlot: 16383 }],
      migratingSlots: [],
      importingSlots: [],
      memoryUsedBytes: 0,
      maxMemoryBytes: 512,
      color: '#fbbf2480',
      storage: {},
    },
  };

  return {
    clusterId,
    tick: 0,
    rngState: 42,
    currentEpoch: 1,
    maxmemorySamples: 5,
    evictionPolicy: 'allkeys-lru',
    nodes,
    clientSlotCache: {},
    totalHits: 0,
    totalMisses: 0,
    totalEvictions: 0,
    totalMovedRedirects: 0,
    totalAskRedirects: 0,
  };
}

export function findMasterForSlot(state: RedisClusterState, slot: number): RedisNode | undefined {
  const nodes = Object.values(state.nodes) as RedisNode[];
  return nodes.find(
    (n) =>
      n.role === 'MASTER' &&
      n.status === 'ALIVE' &&
      n.slotRanges.some((r) => slot >= r.startSlot && slot <= r.endSlot),
  );
}

export function pureRedisTransition(
  state: RedisClusterState,
  event: RedisSimEvent,
  rng: DeterministicRNG,
): RedisTransitionResult {
  const nextState: RedisClusterState = JSON.parse(JSON.stringify(state)) as RedisClusterState;
  const emittedEvents: RedisSimEvent[] = [];

  nextState.tick = event.tick;

  switch (event.type) {
    case 'REDIS_SET':
      handleSet(nextState, event, rng, emittedEvents);
      break;
    case 'REDIS_GET':
      handleGet(nextState, event, emittedEvents);
      break;
    case 'REDIS_DEL':
      handleDel(nextState, event);
      break;
    case 'REDIS_RESHARD':
      handleReshard(nextState, event);
      break;
    case 'REDIS_FAILOVER':
      handleFailover(nextState, event);
      break;
    case 'REDIS_NODE_CRASH':
      handleNodeCrash(nextState, event, emittedEvents);
      break;
    case 'REDIS_NODE_RECOVER':
      handleNodeRecover(nextState, event);
      break;
    case 'REDIS_SET_EVICTION_POLICY':
      handleSetEvictionPolicy(nextState, event);
      break;
    case 'REDIS_TICK':
      handleTick(nextState);
      break;
  }

  nextState.rngState = rng.getState();
  return { nextState, emittedEvents };
}

function handleSet(
  state: RedisClusterState,
  event: RedisSimEvent,
  rng: DeterministicRNG,
  emittedEvents: RedisSimEvent[],
): void {
  const p = event.payload as unknown as RedisSetPayload;
  const key = p.key;
  const value = p.value;
  const slot = getClusterSlot(key);
  const sizeBytes = p.sizeBytes ?? 64;

  const targetMaster = findMasterForSlot(state, slot);
  if (!targetMaster) return;

  // Redirection handling if client hit a different node
  if (p.clientTargetNodeId && p.clientTargetNodeId !== targetMaster.id) {
    const contactedNode = state.nodes[p.clientTargetNodeId];
    if (contactedNode?.migratingSlots.includes(slot)) {
      state.totalAskRedirects++;
      emittedEvents.push({
        id: `ask-${key}-${String(state.tick)}`,
        tick: state.tick + 1,
        type: 'REDIS_ASK_REDIRECT',
        payload: {
          key,
          slot,
          targetMasterId: targetMaster.id,
          targetHost: targetMaster.host,
          targetPort: targetMaster.port,
        },
      });
      // ASK redirection does NOT update clientSlotCache (single request redirect)
    } else {
      state.totalMovedRedirects++;
      state.clientSlotCache[slot] = targetMaster.id; // MOVED permanently updates client route cache
      emittedEvents.push({
        id: `moved-${key}-${String(state.tick)}`,
        tick: state.tick + 1,
        type: 'REDIS_MOVED_REDIRECT',
        payload: {
          key,
          slot,
          targetMasterId: targetMaster.id,
          targetHost: targetMaster.host,
          targetPort: targetMaster.port,
        },
      });
    }
  }

  // Execute on target master with approximate sampling
  const eviction = evictUntilMemoryAvailable(
    targetMaster,
    sizeBytes,
    state.evictionPolicy,
    rng,
    state.maxmemorySamples ?? 5,
  );
  if (eviction.evictedKeys.length > 0) {
    state.totalEvictions += eviction.evictedKeys.length;
  }

  if (eviction.success) {
    const entry: RedisCacheEntry = {
      key,
      value,
      ttl: p.ttl ?? null,
      lastAccessedTick: state.tick,
      accessCount: 1,
      sizeBytes,
    };
    targetMaster.storage[key] = entry;
    targetMaster.memoryUsedBytes += sizeBytes;

    // Replicate to replica
    const nodes = Object.values(state.nodes) as RedisNode[];
    const replica = nodes.find(
      (n) => n.role === 'REPLICA' && n.masterId === targetMaster.id && n.status === 'ALIVE',
    );
    if (replica) {
      replica.storage[key] = JSON.parse(JSON.stringify(entry)) as RedisCacheEntry;
      replica.memoryUsedBytes = targetMaster.memoryUsedBytes;
    }
  }
}

function handleGet(
  state: RedisClusterState,
  event: RedisSimEvent,
  emittedEvents: RedisSimEvent[],
): void {
  const p = event.payload as unknown as RedisGetPayload;
  const key = p.key;
  const slot = getClusterSlot(key);

  const targetMaster = findMasterForSlot(state, slot);
  if (!targetMaster) {
    state.totalMisses++;
    return;
  }

  if (p.clientTargetNodeId && p.clientTargetNodeId !== targetMaster.id) {
    state.totalMovedRedirects++;
    emittedEvents.push({
      id: `moved-${key}-${String(state.tick)}`,
      tick: state.tick + 1,
      type: 'REDIS_MOVED_REDIRECT',
      payload: {
        key,
        slot,
        targetMasterId: targetMaster.id,
        targetHost: targetMaster.host,
        targetPort: targetMaster.port,
      },
    });
  }

  const entry = targetMaster.storage[key];
  if (entry) {
    entry.lastAccessedTick = state.tick;
    entry.accessCount++;
    state.totalHits++;
  } else {
    state.totalMisses++;
  }
}

function handleDel(state: RedisClusterState, event: RedisSimEvent): void {
  const key = String(event.payload['key'] ?? '');
  const slot = getClusterSlot(key);
  const targetMaster = findMasterForSlot(state, slot);
  if (!targetMaster) return;

  const entry = targetMaster.storage[key];
  if (entry) {
    targetMaster.memoryUsedBytes = Math.max(0, targetMaster.memoryUsedBytes - entry.sizeBytes);
    delete targetMaster.storage[key];

    const nodes = Object.values(state.nodes) as RedisNode[];
    const replica = nodes.find((n) => n.role === 'REPLICA' && n.masterId === targetMaster.id);
    if (replica) {
      delete replica.storage[key];
      replica.memoryUsedBytes = targetMaster.memoryUsedBytes;
    }
  }
}

function handleReshard(state: RedisClusterState, event: RedisSimEvent): void {
  const p = event.payload as unknown as RedisReshardPayload;
  const srcId = p.sourceMasterId ?? p.sourceNodeId ?? '';
  const dstId = p.targetMasterId ?? p.targetNodeId ?? '';
  const src = state.nodes[srcId];
  const dst = state.nodes[dstId];
  if (!src || !dst) return;

  const start = p.startSlot ?? p.slot ?? 0;
  const end = p.endSlot ?? p.slot ?? 0;

  // Truncate from src slotRanges
  const newSrcRanges: { startSlot: number; endSlot: number }[] = [];
  for (const r of src.slotRanges) {
    if (end < r.startSlot || start > r.endSlot) {
      newSrcRanges.push(r);
    } else {
      if (r.startSlot < start) {
        newSrcRanges.push({ startSlot: r.startSlot, endSlot: start - 1 });
      }
      if (r.endSlot > end) {
        newSrcRanges.push({ startSlot: end + 1, endSlot: r.endSlot });
      }
    }
  }
  src.slotRanges = newSrcRanges;

  // Add to dst slotRanges
  dst.slotRanges.push({ startSlot: start, endSlot: end });
  dst.slotRanges.sort(
    (a: { startSlot: number }, b: { startSlot: number }) => a.startSlot - b.startSlot,
  );

  // Migrate matching keys
  for (const [key, rawEntry] of Object.entries(src.storage)) {
    const entry = rawEntry as RedisCacheEntry;
    const slot = getClusterSlot(key);
    if (slot >= start && slot <= end) {
      dst.storage[key] = JSON.parse(JSON.stringify(entry)) as RedisCacheEntry;
      dst.memoryUsedBytes += entry.sizeBytes;

      src.memoryUsedBytes = Math.max(0, src.memoryUsedBytes - entry.sizeBytes);
      delete src.storage[key];
    }
  }
}

function handleFailover(state: RedisClusterState, event: RedisSimEvent): void {
  const masterId = String(event.payload['masterId'] ?? '');
  const master = state.nodes[masterId];
  if (!master) return;

  master.status = 'FAIL';

  // Increment cluster current epoch
  state.currentEpoch += 1;

  // Find replica
  const nodes = Object.values(state.nodes) as RedisNode[];
  const replica = nodes.find(
    (n) => n.role === 'REPLICA' && n.masterId === masterId && n.status === 'ALIVE',
  );
  if (replica) {
    replica.role = 'MASTER';
    replica.masterId = null;
    replica.color = master.color; // Adopt primary color
    replica.configEpoch = state.currentEpoch;
    replica.slotRanges = JSON.parse(JSON.stringify(master.slotRanges)) as typeof master.slotRanges;
  }
}

function handleNodeCrash(
  state: RedisClusterState,
  event: RedisSimEvent,
  emittedEvents: RedisSimEvent[],
): void {
  const nodeId = String(event.payload['nodeId'] ?? '');
  const node = state.nodes[nodeId];
  if (node) {
    node.status = 'FAIL';
    if (node.role === 'MASTER') {
      // Trigger automatic failover
      emittedEvents.push({
        id: `failover-${nodeId}-${String(state.tick)}`,
        tick: state.tick + 1,
        type: 'REDIS_FAILOVER',
        payload: { masterId: nodeId },
      });
    }
  }
}

function handleNodeRecover(state: RedisClusterState, event: RedisSimEvent): void {
  const nodeId = String(event.payload['nodeId'] ?? '');
  const node = state.nodes[nodeId];
  if (node) {
    node.status = 'ALIVE';
  }
}

function handleSetEvictionPolicy(state: RedisClusterState, event: RedisSimEvent): void {
  state.evictionPolicy = event.payload['policy'] as EvictionPolicy;
}

function handleTick(state: RedisClusterState): void {
  const nodes = Object.values(state.nodes) as RedisNode[];
  for (const node of nodes) {
    for (const [key, entry] of Object.entries(node.storage)) {
      if (entry.ttl !== null) {
        entry.ttl--;
        if (entry.ttl <= 0) {
          node.memoryUsedBytes = Math.max(0, node.memoryUsedBytes - entry.sizeBytes);
          delete node.storage[key];
        }
      }
    }
  }
}
