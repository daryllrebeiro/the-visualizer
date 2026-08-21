/**
 * Kafka domain types for the simulation engine.
 * The canonical, runtime-validated versions live in packages/contracts.
 * This file re-exports plain types used internally by the engine.
 */

export type NodeId = string;
export type TopicName = string;
export type PartitionId = number;
export type VirtualTimestamp = number;

export type BrokerStatus = 'ALIVE' | 'DEGRADED' | 'CRASHED' | 'RECOVERING';

export interface BrokerNode {
  readonly id: NodeId;
  readonly rack?: string | undefined;
  status: BrokerStatus;
  diskUsageBytes: number;
  maxDiskSizeBytes: number;
  lastHeartbeatTick: VirtualTimestamp;
}

export interface PartitionReplica {
  readonly brokerId: NodeId;
  logEndOffset: number;
  lastCaughtUpTick: VirtualTimestamp;
  isInSync: boolean;
}

export interface TopicPartition {
  readonly topic: TopicName;
  readonly partition: PartitionId;
  leaderBrokerId: NodeId | null;
  leaderEpoch: number;
  replicas: PartitionReplica[];
  isr: NodeId[];
  highWatermark: number;
  minInsyncReplicas: number;
  uncleanLeaderElectionEnabled: boolean;
}

export type ConsumerGroupState =
  'Empty' | 'PreparingRebalance' | 'CompletingRebalance' | 'Stable' | 'Dead';

export type ConsumerProtocol = 'range' | 'roundrobin' | 'cooperative-sticky';

export interface ConsumerGroupMember {
  readonly memberId: string;
  readonly clientId: string;
  readonly clientHost: string;
  assignedPartitions: { topic: TopicName; partition: PartitionId }[];
  lastHeartbeatTick: VirtualTimestamp;
  subscribedTopics?: string[] | undefined;
}

export interface ConsumerGroup {
  readonly id: string;
  state: ConsumerGroupState;
  protocol: ConsumerProtocol;
  generationId: number;
  leaderMemberId: string | null;
  members: Record<string, ConsumerGroupMember>;
  committedOffsets: Record<TopicName, Record<PartitionId, number>>;
}

export type TransactionState =
  'Empty' | 'Ongoing' | 'PrepareCommit' | 'PrepareAbort' | 'CompleteCommit' | 'CompleteAbort';

export interface TransactionMetadata {
  readonly transactionalId: string;
  producerId: number;
  producerEpoch: number;
  txnTimeoutTicks: number;
  state: TransactionState;
  partitionsInTxn: { topic: TopicName; partition: PartitionId }[];
  startTick: VirtualTimestamp;
}

export type MetadataRecordType =
  | 'REGISTER_BROKER_RECORD'
  | 'TOPIC_RECORD'
  | 'PARTITION_RECORD'
  | 'LEADER_CHANGE_RECORD'
  | 'FENCE_BROKER_RECORD'
  | 'UNFENCE_BROKER_RECORD';

export interface MetadataRecord {
  offset: number;
  epoch: number;
  type: MetadataRecordType;
  data: Record<string, unknown>;
  timestamp: VirtualTimestamp;
}

/**
 * Kafka KRaft controller metadata quorum state
 */
export interface KRaftControllerState {
  activeControllerId: NodeId | null;
  controllerEpoch: number;
  voters: NodeId[];
  metadataOffset: number;
  metadataLog?: MetadataRecord[] | undefined;
}

/**
 * The complete, serializable state of the simulated Kafka cluster.
 * This is what gets snapshotted.
 */
export interface KafkaClusterState {
  readonly clusterId: string;
  readonly tick: VirtualTimestamp;
  readonly rngState: number;

  brokers: Record<NodeId, BrokerNode>;
  topics: Record<TopicName, TopicPartition[]>;
  consumerGroups: Record<string, ConsumerGroup>;
  transactions: Record<string, TransactionMetadata>;
  kraft: KRaftControllerState;
}

/**
 * Union of all simulation events the engine can emit.
 * Full event catalog defined in M03.
 */
export type SimEventType =
  | 'BROKER_STATUS_CHANGED'
  | 'BROKER_ADDED'
  | 'TOPIC_CREATED'
  | 'PARTITION_LEADER_ELECTED'
  | 'ISR_CHANGED'
  | 'HIGH_WATERMARK_ADVANCED'
  | 'RECORD_PRODUCED'
  | 'RECORD_CONSUMED'
  | 'OFFSET_COMMITTED'
  | 'CONSUMER_JOINED'
  | 'CONSUMER_LEFT'
  | 'REBALANCE_STARTED'
  | 'REBALANCE_COMPLETED'
  | 'TRANSACTION_STARTED'
  | 'TRANSACTION_COMMITTED'
  | 'TRANSACTION_ABORTED'
  | 'INVARIANT_ASSERTED'
  | 'KRAFT_LEADER_ELECTED'
  | 'CHAOS_APPLIED';

export interface SimEvent {
  readonly id: string;
  readonly tick: VirtualTimestamp;
  readonly type: SimEventType;
  readonly payload: Record<string, unknown>;
}
