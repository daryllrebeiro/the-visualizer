import { z } from 'zod';

import { KafkaClusterStateSchema } from './kafka.js';

export const SimEventTypeSchema = z.enum([
  'BROKER_STATUS_CHANGED',
  'BROKER_ADDED',
  'TOPIC_CREATED',
  'PARTITION_LEADER_ELECTED',
  'ISR_CHANGED',
  'HIGH_WATERMARK_ADVANCED',
  'RECORD_PRODUCED',
  'RECORD_CONSUMED',
  'OFFSET_COMMITTED',
  'CONSUMER_JOINED',
  'CONSUMER_LEFT',
  'REBALANCE_STARTED',
  'REBALANCE_COMPLETED',
  'TRANSACTION_STARTED',
  'TRANSACTION_COMMITTED',
  'TRANSACTION_ABORTED',
  'INVARIANT_ASSERTED',
  'KRAFT_LEADER_ELECTED',
  'CHAOS_APPLIED',
]);
export type SimEventType = z.infer<typeof SimEventTypeSchema>;

export const EntityReferenceSchema = z.object({
  type: z.enum(['BROKER', 'TOPIC', 'PARTITION', 'CONSUMER_GROUP', 'PRODUCER', 'CONTROLLER']),
  id: z.string(),
});
export type EntityReference = z.infer<typeof EntityReferenceSchema>;

export const SimEventLogSchema = z.object({
  id: z.string().min(1),
  tick: z.number().int().nonnegative(),
  type: SimEventTypeSchema,
  payload: z.record(z.string(), z.unknown()),
  timestamp: z.number().nonnegative().optional(),
  involvedEntities: z.array(EntityReferenceSchema).optional(),
  source: z.enum(['INTERNAL', 'USER_INTENT', 'CHAOS', 'KRAFT_CONTROLLER']).optional(),
});
export type SimEventLog = z.infer<typeof SimEventLogSchema>;

export const SimTraceBundleSchema = z.object({
  version: z.string().default('1.0'),
  exportedAt: z.number().nonnegative(),
  clusterId: z.string(),
  name: z.string().max(255).optional(),
  description: z.string().max(2000).optional(),
  initialState: KafkaClusterStateSchema,
  events: z.array(SimEventLogSchema),
  metadata: z
    .object({
      totalTicks: z.number().nonnegative(),
      totalEvents: z.number().nonnegative(),
      generator: z.string().optional(),
      seed: z.number().optional(),
    })
    .optional(),
});
export type SimTraceBundle = z.infer<typeof SimTraceBundleSchema>;

export const ScenarioDefinitionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  badge: z.string().min(1),
  description: z.string().min(1),
  steps: z.array(z.string()),
  actionLabel: z.string().min(1),
  initialState: KafkaClusterStateSchema.optional(),
  events: z.array(SimEventLogSchema).optional(),
  tags: z.array(z.string()).optional(),
});
export type ScenarioDefinition = z.infer<typeof ScenarioDefinitionSchema>;

export const InvariantViolationReportSchema = z.object({
  invariantName: z.string(),
  ruleId: z.string(),
  description: z.string(),
  stepIndex: z.number().int().nonnegative(),
  tick: z.number().int().nonnegative(),
  details: z.record(z.string(), z.unknown()),
});
export type InvariantViolationReport = z.infer<typeof InvariantViolationReportSchema>;
