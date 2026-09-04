export type EvictionPolicy =
  | 'noeviction'
  | 'allkeys-lru'
  | 'allkeys-lfu'
  | 'allkeys-random'
  | 'volatile-lru'
  | 'volatile-lfu'
  | 'volatile-random'
  | 'volatile-ttl';

export type RedisRole = 'MASTER' | 'REPLICA';
export type RedisNodeStatus = 'ALIVE' | 'FAIL';

export interface RedisSlotRange {
  startSlot: number;
  endSlot: number;
}

export interface RedisCacheEntry {
  key: string;
  value: string;
  ttl: number | null;
  lastAccessedTick: number;
  accessCount: number;
  sizeBytes: number;
}

export interface RedisNode {
  id: string;
  host: string;
  port: number;
  clusterBusPort: number; // port + 10000 per Redis Cluster Spec
  configEpoch: number; // incremented on failover
  role: RedisRole;
  masterId: string | null;
  status: RedisNodeStatus;
  slotRanges: RedisSlotRange[];
  migratingSlots: number[];
  importingSlots: number[];
  memoryUsedBytes: number;
  maxMemoryBytes: number;
  storage: Record<string, RedisCacheEntry>;
  color: string;
}

export interface RedisClusterState {
  clusterId: string;
  tick: number;
  rngState: number;
  currentEpoch: number;
  maxmemorySamples: number; // default: 5 (maxmemory-samples in redis.conf)
  evictionPolicy: EvictionPolicy;
  nodes: Record<string, RedisNode>;
  clientSlotCache: Record<number, string>; // client routing cache: slot -> masterId
  totalHits: number;
  totalMisses: number;
  totalEvictions: number;
  totalMovedRedirects: number;
  totalAskRedirects: number;
}

export type RedisEventType =
  | 'REDIS_SET'
  | 'REDIS_GET'
  | 'REDIS_DEL'
  | 'REDIS_RESHARD'
  | 'REDIS_FAILOVER'
  | 'REDIS_NODE_CRASH'
  | 'REDIS_NODE_RECOVER'
  | 'REDIS_SET_EVICTION_POLICY'
  | 'REDIS_TICK'
  | 'REDIS_MOVED_REDIRECT'
  | 'REDIS_ASK_REDIRECT';

export interface RedisSimEvent {
  id: string;
  tick: number;
  type: RedisEventType;
  payload: Record<string, unknown>;
}

export interface RedisSetPayload {
  key: string;
  value: string;
  targetNodeId?: string | undefined;
  clientTargetNodeId?: string | undefined;
  ttl?: number | undefined;
  sizeBytes?: number | undefined;
}

export interface RedisGetPayload {
  key: string;
  targetNodeId?: string | undefined;
  clientTargetNodeId?: string | undefined;
}

export interface RedisReshardPayload {
  slot?: number | undefined;
  startSlot?: number | undefined;
  endSlot?: number | undefined;
  sourceNodeId?: string | undefined;
  targetNodeId?: string | undefined;
  sourceMasterId?: string | undefined;
  targetMasterId?: string | undefined;
}
