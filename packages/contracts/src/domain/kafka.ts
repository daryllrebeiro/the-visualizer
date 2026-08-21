import { z } from 'zod';

// ─── Primitive Branded Types ──────────────────────────────────────────────────

export const NodeIdSchema = z.string().min(1).max(64).brand('NodeId');
export const TopicNameSchema = z
  .string()
  .min(1)
  .max(249)
  .regex(/^[a-zA-Z0-9._-]+$/, 'Invalid Kafka topic name')
  .brand('TopicName');
export const PartitionIdSchema = z.number().int().nonnegative().brand('PartitionId');
export const ConsumerGroupIdSchema = z.string().min(1).max(255).brand('ConsumerGroupId');

export type NodeId = z.infer<typeof NodeIdSchema>;
export type TopicName = z.infer<typeof TopicNameSchema>;
export type PartitionId = z.infer<typeof PartitionIdSchema>;
export type ConsumerGroupId = z.infer<typeof ConsumerGroupIdSchema>;

// ─── Broker ──────────────────────────────────────────────────────────────────

export const BrokerStatusSchema = z.enum(['ALIVE', 'DEGRADED', 'CRASHED', 'RECOVERING']);
export type BrokerStatus = z.infer<typeof BrokerStatusSchema>;

export const BrokerNodeSchema = z.object({
  id: NodeIdSchema,
  host: z.string().min(1).max(255),
  port: z.number().int().min(1).max(65535),
  rack: z.string().max(128).optional(),
  status: BrokerStatusSchema,
  diskUsageBytes: z.number().nonnegative(),
  maxDiskSizeBytes: z.number().positive(),
  lastHeartbeatTick: z.number().nonnegative(),
});
export type BrokerNode = z.infer<typeof BrokerNodeSchema>;

// ─── Partition / Replication ──────────────────────────────────────────────────

export const PartitionReplicaSchema = z.object({
  brokerId: NodeIdSchema,
  logEndOffset: z.number().nonnegative(),
  lastCaughtUpTick: z.number().nonnegative(),
  isInSync: z.boolean(),
});
export type PartitionReplica = z.infer<typeof PartitionReplicaSchema>;

export const TopicPartitionSchema = z.object({
  topic: TopicNameSchema,
  partition: PartitionIdSchema,
  leaderBrokerId: NodeIdSchema.nullable(),
  leaderEpoch: z.number().nonnegative(),
  replicas: z.array(PartitionReplicaSchema).min(1).max(10),
  isr: z.array(NodeIdSchema),
  highWatermark: z.number().nonnegative(),
  minInsyncReplicas: z.number().int().positive(),
  uncleanLeaderElectionEnabled: z.boolean(),
});
export type TopicPartition = z.infer<typeof TopicPartitionSchema>;

// ─── Consumer Groups ──────────────────────────────────────────────────────────

export const ConsumerGroupStateSchema = z.enum([
  'Empty',
  'PreparingRebalance',
  'CompletingRebalance',
  'Stable',
  'Dead',
]);
export type ConsumerGroupState = z.infer<typeof ConsumerGroupStateSchema>;

export const ConsumerProtocolSchema = z.enum(['range', 'roundrobin', 'cooperative-sticky']);
export type ConsumerProtocol = z.infer<typeof ConsumerProtocolSchema>;

export const ConsumerGroupMemberSchema = z.object({
  memberId: z.string().min(1).max(255),
  clientId: z.string().min(1).max(255),
  clientHost: z.string().max(255),
  assignedPartitions: z.array(
    z.object({
      topic: TopicNameSchema,
      partition: PartitionIdSchema,
    }),
  ),
  lastHeartbeatTick: z.number().nonnegative(),
  subscribedTopics: z.array(z.string().min(1).max(255)).optional(),
});
export type ConsumerGroupMember = z.infer<typeof ConsumerGroupMemberSchema>;

export const ConsumerGroupSchema = z.object({
  id: ConsumerGroupIdSchema,
  state: ConsumerGroupStateSchema,
  protocol: ConsumerProtocolSchema,
  generationId: z.number().nonnegative(),
  leaderMemberId: z.string().nullable(),
  members: z.record(z.string(), ConsumerGroupMemberSchema),
  committedOffsets: z.record(z.string(), z.record(z.string(), z.number().nonnegative())),
});
export type ConsumerGroup = z.infer<typeof ConsumerGroupSchema>;

// ─── Transactions ─────────────────────────────────────────────────────────────

export const TransactionStateSchema = z.enum([
  'Empty',
  'Ongoing',
  'PrepareCommit',
  'PrepareAbort',
  'CompleteCommit',
  'CompleteAbort',
]);
export type TransactionState = z.infer<typeof TransactionStateSchema>;

export const TransactionMetadataSchema = z.object({
  transactionalId: z.string().min(1).max(255),
  producerId: z.number().nonnegative(),
  producerEpoch: z.number().nonnegative(),
  txnTimeoutTicks: z.number().positive(),
  state: TransactionStateSchema,
  partitionsInTxn: z.array(z.object({ topic: TopicNameSchema, partition: PartitionIdSchema })),
  startTick: z.number().nonnegative(),
});
export type TransactionMetadata = z.infer<typeof TransactionMetadataSchema>;

// ─── KRaft ───────────────────────────────────────────────────────────────────

export const MetadataRecordTypeSchema = z.enum([
  'REGISTER_BROKER_RECORD',
  'TOPIC_RECORD',
  'PARTITION_RECORD',
  'LEADER_CHANGE_RECORD',
  'FENCE_BROKER_RECORD',
  'UNFENCE_BROKER_RECORD',
]);
export type MetadataRecordType = z.infer<typeof MetadataRecordTypeSchema>;

export const MetadataRecordSchema = z.object({
  offset: z.number().nonnegative(),
  epoch: z.number().nonnegative(),
  type: MetadataRecordTypeSchema,
  data: z.record(z.string(), z.unknown()),
  timestamp: z.number().nonnegative(),
});
export type MetadataRecord = z.infer<typeof MetadataRecordSchema>;

export const KRaftControllerStateSchema = z.object({
  activeControllerId: NodeIdSchema.nullable(),
  controllerEpoch: z.number().nonnegative(),
  voters: z.array(NodeIdSchema),
  metadataOffset: z.number().nonnegative(),
  metadataLog: z.array(MetadataRecordSchema).optional(),
});
export type KRaftControllerState = z.infer<typeof KRaftControllerStateSchema>;

// ─── Full Cluster State ───────────────────────────────────────────────────────

export const KafkaClusterStateSchema = z.object({
  clusterId: z.string().uuid(),
  tick: z.number().nonnegative(),
  rngState: z.number().int(),
  brokers: z.record(z.string(), BrokerNodeSchema),
  topics: z.record(z.string(), z.array(TopicPartitionSchema)),
  consumerGroups: z.record(z.string(), ConsumerGroupSchema),
  transactions: z.record(z.string(), TransactionMetadataSchema),
  kraft: KRaftControllerStateSchema,
});
export type KafkaClusterState = z.infer<typeof KafkaClusterStateSchema>;
