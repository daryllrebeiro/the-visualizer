import { z } from 'zod';

export const EvictionPolicySchema = z.enum([
  'noeviction',
  'allkeys-lru',
  'allkeys-lfu',
  'volatile-ttl',
  'allkeys-random',
]);
export type EvictionPolicy = z.infer<typeof EvictionPolicySchema>;

export const RedisRoleSchema = z.enum(['MASTER', 'REPLICA']);
export type RedisRole = z.infer<typeof RedisRoleSchema>;

export const RedisNodeStatusSchema = z.enum(['ALIVE', 'FAIL']);
export type RedisNodeStatus = z.infer<typeof RedisNodeStatusSchema>;

export const RedisSlotRangeSchema = z.object({
  startSlot: z.number().int().min(0).max(16383),
  endSlot: z.number().int().min(0).max(16383),
});
export type RedisSlotRange = z.infer<typeof RedisSlotRangeSchema>;

export const RedisCacheEntrySchema = z.object({
  key: z.string().min(1),
  value: z.string(),
  ttl: z.number().int().positive().nullable().default(null),
  lastAccessedTick: z.number().int().nonnegative(),
  accessCount: z.number().int().nonnegative().default(1),
  sizeBytes: z.number().int().positive().default(64),
});
export type RedisCacheEntry = z.infer<typeof RedisCacheEntrySchema>;

export const RedisNodeSchema = z.object({
  id: z.string().min(1),
  host: z.string(),
  port: z.number().int(),
  role: RedisRoleSchema,
  masterId: z.string().nullable().default(null),
  status: RedisNodeStatusSchema,
  slotRanges: z.array(RedisSlotRangeSchema),
  migratingSlots: z.array(z.number().int().min(0).max(16383)).default([]),
  importingSlots: z.array(z.number().int().min(0).max(16383)).default([]),
  memoryUsedBytes: z.number().int().nonnegative().default(0),
  maxMemoryBytes: z.number().int().positive().default(1024),
  storage: z.record(z.string(), RedisCacheEntrySchema),
  color: z.string(),
});
export type RedisNode = z.infer<typeof RedisNodeSchema>;

export const RedisClusterStateSchema = z.object({
  clusterId: z.string(),
  tick: z.number().nonnegative(),
  rngState: z.number().int(),
  evictionPolicy: EvictionPolicySchema.default('allkeys-lru'),
  nodes: z.record(z.string(), RedisNodeSchema),
  totalHits: z.number().int().nonnegative().default(0),
  totalMisses: z.number().int().nonnegative().default(0),
  totalEvictions: z.number().int().nonnegative().default(0),
  totalMovedRedirects: z.number().int().nonnegative().default(0),
  totalAskRedirects: z.number().int().nonnegative().default(0),
});
export type RedisClusterState = z.infer<typeof RedisClusterStateSchema>;
