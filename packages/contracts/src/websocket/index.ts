import { z } from 'zod';

// ─── Client → Server Intents ─────────────────────────────────────────────────

const IntentBaseSchema = z.object({
  id: z.string().uuid(), // Idempotency key — client-generated
});

export const IntentProduceSchema = IntentBaseSchema.extend({
  type: z.literal('INTENT_PRODUCE'),
  topic: z.string().min(1).max(249),
  partition: z.number().int().nonnegative().optional(),
  key: z.string().max(4096),
  value: z.string().max(1_048_576), // 1 MB max
  acks: z.union([z.literal(0), z.literal(1), z.literal(-1)]),
});

export const IntentConsumerJoinSchema = IntentBaseSchema.extend({
  type: z.literal('INTENT_CONSUMER_JOIN'),
  groupId: z.string().min(1).max(255),
  clientId: z.string().min(1).max(255),
  topics: z.array(z.string().min(1).max(249)).min(1).max(50),
});

export const IntentConsumerLeaveSchema = IntentBaseSchema.extend({
  type: z.literal('INTENT_CONSUMER_LEAVE'),
  groupId: z.string().min(1).max(255),
  memberId: z.string().min(1).max(255),
});

export const IntentConsumerPollSchema = IntentBaseSchema.extend({
  type: z.literal('INTENT_CONSUMER_POLL'),
  groupId: z.string().min(1).max(255),
  memberId: z.string().min(1).max(255),
});

export const IntentCommitOffsetSchema = IntentBaseSchema.extend({
  type: z.literal('INTENT_COMMIT_OFFSET'),
  groupId: z.string().min(1).max(255),
  memberId: z.string().min(1).max(255),
  topic: z.string().min(1).max(249),
  partition: z.number().int().nonnegative(),
  offset: z.number().nonnegative(),
});

export const IntentChaosKillBrokerSchema = IntentBaseSchema.extend({
  type: z.literal('INTENT_CHAOS_KILL_BROKER'),
  brokerId: z.string().min(1).max(64),
});

export const IntentChaosRecoverBrokerSchema = IntentBaseSchema.extend({
  type: z.literal('INTENT_CHAOS_RECOVER_BROKER'),
  brokerId: z.string().min(1).max(64),
});

export const IntentChaosNetworkPartitionSchema = IntentBaseSchema.extend({
  type: z.literal('INTENT_CHAOS_NETWORK_PARTITION'),
  isolatedBrokerIds: z.array(z.string().min(1).max(64)).min(1).max(100),
  durationTicks: z.number().int().positive().max(50_000),
});

export const IntentSimControlSchema = IntentBaseSchema.extend({
  type: z.literal('INTENT_SIM_CONTROL'),
  action: z.enum(['PLAY', 'PAUSE', 'STEP_FORWARD', 'STEP_BACK', 'SET_SPEED']),
  speedMultiplier: z.number().positive().max(100).optional(),
});

export const IntentRequestSnapshotSchema = IntentBaseSchema.extend({
  type: z.literal('INTENT_REQUEST_SNAPSHOT'),
});

export const IntentAddBrokerSchema = IntentBaseSchema.extend({
  type: z.literal('INTENT_ADD_BROKER'),
  brokerId: z.string().min(1).max(64),
  rack: z.string().optional(),
});

export const IntentCreateTopicSchema = IntentBaseSchema.extend({
  type: z.literal('INTENT_CREATE_TOPIC'),
  topic: z.string().min(1).max(249),
  partitions: z.number().int().positive().max(10),
});

export const IntentSetAutoProduceSchema = IntentBaseSchema.extend({
  type: z.literal('INTENT_SET_AUTO_PRODUCE'),
  producerId: z.string().min(1).max(64),
  topic: z.string().min(1).max(249),
  intervalSeconds: z.number().positive().max(300),
  enabled: z.boolean(),
});

export const IntentRemoveAutoProduceSchema = IntentBaseSchema.extend({
  type: z.literal('INTENT_REMOVE_AUTO_PRODUCE'),
  producerId: z.string().min(1).max(64),
});

/**
 * Discriminated union of all valid client intents.
 * Validated on the server before any simulation action is taken.
 */
export const ClientIntentSchema = z.discriminatedUnion('type', [
  IntentProduceSchema,
  IntentConsumerJoinSchema,
  IntentConsumerLeaveSchema,
  IntentConsumerPollSchema,
  IntentCommitOffsetSchema,
  IntentChaosKillBrokerSchema,
  IntentChaosRecoverBrokerSchema,
  IntentChaosNetworkPartitionSchema,
  IntentSimControlSchema,
  IntentRequestSnapshotSchema,
  IntentAddBrokerSchema,
  IntentCreateTopicSchema,
  IntentSetAutoProduceSchema,
  IntentRemoveAutoProduceSchema,
]);
export type ClientIntent = z.infer<typeof ClientIntentSchema>;

// ─── Server → Client Messages ─────────────────────────────────────────────────

export const SessionLimitsSchema = z.object({
  maxTicks: z.number().positive(),
  maxBrokers: z.number().positive(),
  maxPartitions: z.number().positive(),
  maxProducers: z.number().positive(),
  maxConsumers: z.number().positive(),
  maxMsgRatePerSec: z.number().positive(),
});
export type SessionLimits = z.infer<typeof SessionLimitsSchema>;

export const ServerMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('MSG_INIT_SNAPSHOT'),
    sessionId: z.string().uuid(),
    serverTick: z.number().nonnegative(),
    state: z.record(z.string(), z.unknown()), // KafkaClusterState
    sessionConfig: SessionLimitsSchema,
  }),
  z.object({
    type: z.literal('MSG_EVENT_BATCH'),
    fromSeq: z.number().nonnegative(),
    toSeq: z.number().positive(),
    serverTick: z.number().nonnegative(),
    events: z.array(z.record(z.string(), z.unknown())),
    patches: z.array(z.record(z.string(), z.unknown())),
  }),
  z.object({
    type: z.literal('MSG_INTENT_ACK'),
    intentId: z.string().uuid(),
    status: z.enum(['ACCEPTED', 'REJECTED']),
    reason: z.string().max(500).optional(),
  }),
  z.object({
    type: z.literal('MSG_INVARIANT_VIOLATION'),
    invariantName: z.string(),
    details: z.string().max(2000),
    dumpUrl: z.string().url().optional(),
  }),
  z.object({
    type: z.literal('MSG_PRESENCE_UPDATE'),
    activeUsers: z.array(
      z.object({
        userId: z.string().uuid(),
        name: z.string().max(255),
        cursor: z.object({ x: z.number(), y: z.number() }).optional(),
      }),
    ),
  }),
  z.object({
    type: z.literal('MSG_SESSION_ERROR'),
    code: z.string(),
    message: z.string().max(500),
    fatal: z.boolean(),
  }),
]);
export type ServerMessage = z.infer<typeof ServerMessageSchema>;
