import { z } from 'zod';

export const ConsistencyLevelSchema = z.enum(['ONE', 'QUORUM', 'ALL', 'LOCAL_QUORUM']);
export type ConsistencyLevel = z.infer<typeof ConsistencyLevelSchema>;

export const DBNodeStatusSchema = z.enum(['ALIVE', 'DOWN', 'JOINING', 'LEAVING']);
export type DBNodeStatus = z.infer<typeof DBNodeStatusSchema>;

export const DBValueRecordSchema = z.object({
  key: z.string().min(1),
  value: z.string(),
  version: z.number().int().nonnegative(),
  timestamp: z.number().int().nonnegative(),
  vectorClock: z.record(z.string(), z.number().int().nonnegative()),
  deleted: z.boolean().default(false),
});
export type DBValueRecord = z.infer<typeof DBValueRecordSchema>;

export const HintedHandoffRecordSchema = z.object({
  targetNodeId: z.string(),
  key: z.string(),
  record: DBValueRecordSchema,
  storedAtTick: z.number().nonnegative(),
});
export type HintedHandoffRecord = z.infer<typeof HintedHandoffRecordSchema>;

export const DBNodeSchema = z.object({
  id: z.string().min(1),
  host: z.string(),
  status: DBNodeStatusSchema,
  tokens: z.array(z.number().int().nonnegative()),
  storage: z.record(z.string(), DBValueRecordSchema),
  hints: z.array(HintedHandoffRecordSchema),
  color: z.string(),
});
export type DBNode = z.infer<typeof DBNodeSchema>;

export const RingTokenMappingSchema = z.object({
  token: z.number().int().nonnegative(),
  nodeId: z.string(),
});
export type RingTokenMapping = z.infer<typeof RingTokenMappingSchema>;

export const DBClusterStateSchema = z.object({
  clusterId: z.string(),
  tick: z.number().nonnegative(),
  rngState: z.number().int(),
  replicationFactor: z.number().int().positive().default(3),
  writeConsistency: ConsistencyLevelSchema.default('QUORUM'),
  readConsistency: ConsistencyLevelSchema.default('QUORUM'),
  nodes: z.record(z.string(), DBNodeSchema),
  ringTokens: z.array(RingTokenMappingSchema),
  totalOperations: z.number().int().nonnegative(),
  staleReadsObserved: z.number().int().nonnegative(),
  readRepairsCompleted: z.number().int().nonnegative(),
});
export type DBClusterState = z.infer<typeof DBClusterStateSchema>;
