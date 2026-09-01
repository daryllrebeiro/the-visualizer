export type EvictionPolicy =
  | 'noeviction'
  | 'allkeys-lru'
  | 'allkeys-lfu'
  | 'volatile-ttl'
  | 'allkeys-random';

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
  evictionPolicy: EvictionPolicy;
  nodes: Record<string, RedisNode>;
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
  ttl?: number | null | undefined;
  sizeBytes?: number | undefined;
  clientTargetNodeId?: string | undefined;
}

export interface RedisGetPayload {
  key: string;
  clientTargetNodeId?: string | undefined;
}

export interface RedisReshardPayload {
  sourceMasterId: string;
  targetMasterId: string;
  startSlot: number;
  endSlot: number;
}
