/**
 * packages/simulation — Deterministic Discrete-Event Simulation Engine
 *
 * ARCHITECTURE RULE: This package has ZERO runtime I/O dependencies.
 * It must run identically in:
 *   - Browser WebWorker (solo sandbox mode)
 *   - Node.js worker threads (multiplayer server mode)
 *
 * No imports from: window, document, process.env, fs, fetch, ws,
 *                  http, PostgreSQL, Redis, or any framework.
 */

export { DeterministicRNG } from './prng/deterministic-rng.js';
export { MinHeapPriorityQueue } from './scheduler/min-heap.js';
export { VirtualTimeline } from './scheduler/virtual-timeline.js';
export { SimulationEngine } from './engine/simulation-engine.js';
export { pureStateTransition, type TransitionResult } from './engine/state-transitions.js';
export type { SimEvent } from './engine/types.js';
export { InvariantChecker } from './invariants/invariant-checker.js';
export { SnapshotManager } from './snapshot/snapshot-manager.js';

export { PartitionLog } from './domain/partition-log.js';
export { InMemoryStorageAdapter } from './domain/storage-adapter.js';
export { KafkaOracleHarness, type OracleScenarioResult } from './oracle/oracle-harness.js';
export { kafkaMurmur2, partitionForKey, toPositive } from './partitioners/murmur2.js';
export {
  PartitionLogStorage,
  type PhysicalLogRecord,
  type LogSegmentSummary,
} from './storage/log-segment.js';
export {
  TransactionCoordinatorManager,
  type ActiveTxnSession,
  type TransactionState,
} from './transactions/txn-coordinator.js';

export {
  EventLogParser,
  createDefaultBaselineState,
  type ParsedTraceResult,
} from './reconstitution/event-log-parser.js';
export {
  SimulationReconstitutor,
  type ReconstitutedStepMetadata,
  type ReconstitutionPatch,
  type StepResult,
} from './reconstitution/simulation-reconstitutor.js';
export {
  ScenarioGenerator,
  type ScenarioGeneratorOptions,
} from './reconstitution/scenario-generator.js';

export {
  DomainRegistry,
  KafkaDomainPlugin,
  RaftDomainPlugin,
  DatabaseDomainPlugin,
  RedisDomainPlugin,
  KubernetesDomainPlugin,
  RabbitMQDomainPlugin,
  StorageDomainPlugin,
  NetworkingDomainPlugin,
  type DomainPlugin,
  type DomainPluginMetadata,
} from './domains/registry.js';
export {
  createDefaultStorageCluster,
  pureStorageTransition,
  type StorageTransitionResult,
} from './domains/storage/storage-state-transitions.js';
export {
  StorageInvariantChecker,
  type StorageInvariantViolation,
} from './domains/storage/storage-invariants.js';
export { STORAGE_SCENARIOS } from './domains/storage/storage-scenarios.js';
export type {
  StorageEngineType,
  BTreeNode,
  BTreeState,
  SSTableEntry,
  SSTable,
  LSMTreeState,
  StorageEngineClusterState,
  StorageEventType,
  StorageSimEvent,
} from './domains/storage/storage-types.js';
export {
  createDefaultNetworkingCluster,
  pureNetworkingTransition,
  type NetworkTransitionResult,
} from './domains/networking/networking-state-transitions.js';
export {
  NetworkInvariantChecker,
  type NetworkInvariantViolation,
} from './domains/networking/networking-invariants.js';
export { NETWORKING_SCENARIOS } from './domains/networking/networking-scenarios.js';
export type {
  TCPPacketFlag,
  TCPConnectionState,
  CongestionPhase,
  TCPPacket,
  CongestionControlState,
  TCPSlidingWindowSlot,
  NetworkingClusterState,
  NetworkEventType,
  NetworkSimEvent,
} from './domains/networking/networking-types.js';
export { matchTopicPattern } from './domains/rabbitmq/topic-matcher.js';
export {
  createDefaultRabbitCluster,
  pureRabbitTransition,
  type RabbitTransitionResult,
} from './domains/rabbitmq/rabbitmq-state-transitions.js';
export {
  RabbitInvariantChecker,
  type RabbitInvariantViolation,
} from './domains/rabbitmq/rabbitmq-invariants.js';
export { RABBITMQ_SCENARIOS } from './domains/rabbitmq/rabbitmq-scenarios.js';
export type {
  ExchangeType,
  ExchangeSpec,
  BindingSpec,
  AMQPMessageState,
  AMQPMessage,
  RabbitQueue,
  RabbitConsumer,
  RabbitClusterState,
  RabbitEventType,
  RabbitSimEvent,
  RabbitPublishPayload,
} from './domains/rabbitmq/rabbitmq-types.js';
export { K8sScheduler, type SchedulingDecision } from './domains/kubernetes/k8s-scheduler.js';
export {
  createDefaultK8sCluster,
  pureK8sTransition,
  type K8sTransitionResult,
} from './domains/kubernetes/k8s-state-transitions.js';
export {
  K8sInvariantChecker,
  type K8sInvariantViolation,
} from './domains/kubernetes/k8s-invariants.js';
export { K8S_SCENARIOS } from './domains/kubernetes/k8s-scenarios.js';
export type {
  ResourceRequirements,
  TaintEffect,
  Taint,
  Toleration,
  PodStatus,
  PodSpec,
  K8sNodeStatus,
  K8sNode,
  DeploymentStrategy,
  DeploymentSpec,
  ReplicaSetSpec,
  K8sClusterState,
  K8sEventType,
  K8sSimEvent,
} from './domains/kubernetes/k8s-types.js';
export { crc16, extractHashTag, getClusterSlot } from './domains/redis/crc16.js';
export {
  createDefaultRedisCluster,
  findMasterForSlot,
  pureRedisTransition,
  type RedisTransitionResult,
} from './domains/redis/redis-state-transitions.js';
export {
  RedisInvariantChecker,
  type RedisInvariantViolation,
} from './domains/redis/redis-invariants.js';
export { REDIS_SCENARIOS } from './domains/redis/redis-scenarios.js';
export type {
  EvictionPolicy,
  RedisRole,
  RedisNodeStatus,
  RedisSlotRange,
  RedisCacheEntry,
  RedisNode,
  RedisClusterState,
  RedisSimEvent,
  RedisEventType,
  RedisSetPayload,
  RedisGetPayload,
  RedisReshardPayload,
} from './domains/redis/redis-types.js';
export { ConsistentHashRing, hashToToken, type RingToken } from './domains/database/hash-ring.js';
export {
  createDefaultDBCluster,
  pureDBTransition,
  type DBTransitionResult,
} from './domains/database/db-state-transitions.js';
export { DBInvariantChecker, type DBInvariantViolation } from './domains/database/db-invariants.js';
export { DB_SCENARIOS } from './domains/database/db-scenarios.js';
export type {
  ConsistencyLevel,
  DBClusterState,
  DBNode,
  DBNodeStatus,
  DBValueRecord,
  HintedHandoffRecord,
  RingTokenMapping,
  DBSimEvent,
  DBEventType,
  DBWriteRequestPayload,
  DBReadRequestPayload,
} from './domains/database/db-types.js';
export {
  createDefaultRaftCluster,
  pureRaftTransition,
  type RaftTransitionResult,
} from './domains/raft/raft-state-transitions.js';
export {
  RaftInvariantChecker,
  type RaftInvariantViolation,
} from './domains/raft/raft-invariants.js';
export { RAFT_SCENARIOS } from './domains/raft/raft-scenarios.js';
export type {
  RaftClusterState,
  RaftNode,
  RaftRole,
  RaftNodeStatus,
  RaftLogEntry,
  RaftSimEvent,
  RaftEventType,
} from './domains/raft/raft-types.js';

export type { SimulationConfig } from './engine/simulation-engine.js';
export type { ScheduledEvent, VirtualTimestamp } from './scheduler/virtual-timeline.js';
export type { InvariantViolation } from './invariants/invariant-checker.js';
export type { Snapshot, SnapshotMetadata } from './snapshot/snapshot-manager.js';
export type {
  LogRecord,
  LogSegment,
  AppendResult,
  FetchResult,
  PartitionLogOptions,
} from './domain/partition-log.js';
export type {
  SimEventLog,
  SimTraceBundle,
  ScenarioDefinition,
  InvariantViolationReport,
  KafkaClusterState,
} from './engine/types.js';
export type { StorageAdapter } from './domain/storage-adapter.js';

// Domain: Rate Limiter
export * from './domains/rate-limiter/rate-limiter-types.js';
export * from './domains/rate-limiter/rate-limiter-state-transitions.js';
export * from './domains/rate-limiter/rate-limiter-invariants.js';
export * from './domains/rate-limiter/rate-limiter-algorithms.js';

// Domain: Distributed Lock Manager
export * from './domains/distributed-lock/distributed-lock-types.js';
export * from './domains/distributed-lock/distributed-lock-state-transitions.js';
export * from './domains/distributed-lock/distributed-lock-invariants.js';
export * from './domains/distributed-lock/distributed-lock-algorithms.js';

// Domain: CDN & Multi-Tier Caching
export * from './domains/cdn-cache/cdn-cache-types.js';
export * from './domains/cdn-cache/cdn-cache-state-transitions.js';
export * from './domains/cdn-cache/cdn-cache-invariants.js';
export * from './domains/cdn-cache/http-cache-semantics.js';

// Domain: Distributed ID Generation
export * from './domains/id-gen/id-gen-types.js';
export * from './domains/id-gen/id-gen-state-transitions.js';
export * from './domains/id-gen/id-gen-invariants.js';
export * from './domains/id-gen/snowflake-generator.js';

// Domain: Distributed Transactions
export * from './domains/transactions/transactions-types.js';
export * from './domains/transactions/transactions-state-transitions.js';
export * from './domains/transactions/transactions-invariants.js';
export * from './domains/transactions/two-phase-commit.js';
export * from './domains/transactions/saga-orchestrator.js';
