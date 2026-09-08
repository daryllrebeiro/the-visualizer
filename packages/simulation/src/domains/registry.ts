import { pureStateTransition } from '../engine/state-transitions.js';
import type { KafkaClusterState, SimEvent } from '../engine/types.js';
import { InvariantChecker } from '../invariants/invariant-checker.js';
import { KafkaOracleHarness } from '../oracle/oracle-harness.js';
import type { DeterministicRNG } from '../prng/deterministic-rng.js';
import { createDefaultBaselineState } from '../reconstitution/event-log-parser.js';
import { CdnCacheInvariantChecker } from './cdn-cache/cdn-cache-invariants.js';
import {
  createDefaultCdnCacheCluster,
  pureCdnCacheTransition,
} from './cdn-cache/cdn-cache-state-transitions.js';
import type { CdnCacheClusterState, CdnCacheSimEvent } from './cdn-cache/cdn-cache-types.js';
import { DBInvariantChecker } from './database/db-invariants.js';
import { DB_SCENARIOS } from './database/db-scenarios.js';
import { createDefaultDBCluster, pureDBTransition } from './database/db-state-transitions.js';
import type { DBClusterState, DBSimEvent } from './database/db-types.js';
import { DistributedLockInvariantChecker } from './distributed-lock/distributed-lock-invariants.js';
import {
  createDefaultDistributedLockCluster,
  pureDistributedLockTransition,
} from './distributed-lock/distributed-lock-state-transitions.js';
import type {
  DistributedLockClusterState,
  DistributedLockSimEvent,
} from './distributed-lock/distributed-lock-types.js';
import { IdGenInvariantChecker } from './id-gen/id-gen-invariants.js';
import {
  createDefaultIdGenCluster,
  pureIdGenTransition,
} from './id-gen/id-gen-state-transitions.js';
import type { IdGenClusterState, IdGenSimEvent } from './id-gen/id-gen-types.js';
import { K8sInvariantChecker } from './kubernetes/k8s-invariants.js';
import { K8S_SCENARIOS } from './kubernetes/k8s-scenarios.js';
import { createDefaultK8sCluster, pureK8sTransition } from './kubernetes/k8s-state-transitions.js';
import type { K8sClusterState, K8sSimEvent } from './kubernetes/k8s-types.js';
import { NetworkInvariantChecker } from './networking/networking-invariants.js';
import { NETWORKING_SCENARIOS } from './networking/networking-scenarios.js';
import {
  createDefaultNetworkingCluster,
  pureNetworkingTransition,
} from './networking/networking-state-transitions.js';
import type { NetworkSimEvent, NetworkingClusterState } from './networking/networking-types.js';
import { RabbitInvariantChecker } from './rabbitmq/rabbitmq-invariants.js';
import { RABBITMQ_SCENARIOS } from './rabbitmq/rabbitmq-scenarios.js';
import {
  createDefaultRabbitCluster,
  pureRabbitTransition,
} from './rabbitmq/rabbitmq-state-transitions.js';
import type { RabbitClusterState, RabbitSimEvent } from './rabbitmq/rabbitmq-types.js';
import { RaftInvariantChecker } from './raft/raft-invariants.js';
import { RAFT_SCENARIOS } from './raft/raft-scenarios.js';
import { createDefaultRaftCluster, pureRaftTransition } from './raft/raft-state-transitions.js';
import type { RaftClusterState, RaftSimEvent } from './raft/raft-types.js';
import { RateLimiterInvariantChecker } from './rate-limiter/rate-limiter-invariants.js';
import {
  createDefaultRateLimiterCluster,
  pureRateLimiterTransition,
} from './rate-limiter/rate-limiter-state-transitions.js';
import type {
  RateLimiterClusterState,
  RateLimiterSimEvent,
} from './rate-limiter/rate-limiter-types.js';
import { RedisInvariantChecker } from './redis/redis-invariants.js';
import { REDIS_SCENARIOS } from './redis/redis-scenarios.js';
import { createDefaultRedisCluster, pureRedisTransition } from './redis/redis-state-transitions.js';
import type { RedisClusterState, RedisSimEvent } from './redis/redis-types.js';
import { StorageInvariantChecker } from './storage/storage-invariants.js';
import { STORAGE_SCENARIOS } from './storage/storage-scenarios.js';
import {
  createDefaultStorageCluster,
  pureStorageTransition,
} from './storage/storage-state-transitions.js';
import type { StorageEngineClusterState, StorageSimEvent } from './storage/storage-types.js';
import { TransactionsInvariantChecker } from './transactions/transactions-invariants.js';
import {
  createDefaultTransactionsCluster,
  pureTransactionsTransition,
} from './transactions/transactions-state-transitions.js';
import type {
  TransactionsClusterState,
  TransactionsSimEvent,
} from './transactions/transactions-types.js';


import { LLMServingInvariantChecker } from './llm-serving/llm-serving-invariants.js';
import { createDefaultLLMServingCluster, pureLLMServingTransition } from './llm-serving/llm-serving-state-transitions.js';
import type { LLMServingClusterState, LLMServingSimEvent } from './llm-serving/llm-serving-types.js';

import { VectorDBInvariantChecker } from './vectordb/vectordb-invariants.js';
import { createDefaultVectorDBCluster, pureVectorDBTransition } from './vectordb/vectordb-state-transitions.js';
import type { VectorDBClusterState, VectorDBSimEvent } from './vectordb/vectordb-types.js';

import { GPUClusterInvariantChecker } from './gpu-cluster/gpu-cluster-invariants.js';
import { createDefaultGPUCluster, pureGPUClusterTransition } from './gpu-cluster/gpu-cluster-state-transitions.js';
import type { GPUClusterState, GPUClusterSimEvent } from './gpu-cluster/gpu-cluster-types.js';

import { LlmPipelineInvariantChecker } from './llm-pipeline/llm-pipeline-invariants.js';
import { createDefaultLlmPipelineCluster, pureLlmPipelineTransition } from './llm-pipeline/llm-pipeline-state-transitions.js';
import type { LlmPipelineClusterState, LlmPipelineSimEvent } from './llm-pipeline/llm-pipeline-types.js';

import { LlmGatewayInvariantChecker } from './llm-gateway/llm-gateway-invariants.js';
import { createDefaultLlmGatewayCluster, pureLlmGatewayTransition } from './llm-gateway/llm-gateway-state-transitions.js';
import type { LlmGatewayClusterState, LlmGatewaySimEvent } from './llm-gateway/llm-gateway-types.js';

import { LBInvariantChecker } from './load-balancer/load-balancer-invariants.js';
import { createDefaultLBCluster, pureLBTransition } from './load-balancer/load-balancer-state-transitions.js';
import type { LBClusterState, LBSimEvent } from './load-balancer/load-balancer-types.js';

import { SearchIndexInvariantChecker } from './search-index/search-index-invariants.js';
import { createDefaultSearchIndexCluster, pureSearchIndexTransition } from './search-index/search-index-state-transitions.js';
import type { SearchIndexClusterState, SearchIndexSimEvent } from './search-index/search-index-types.js';

import { TaskSchedulerInvariantChecker } from './task-scheduler/task-scheduler-invariants.js';
import { createDefaultTaskSchedulerCluster, pureTaskSchedulerTransition } from './task-scheduler/task-scheduler-state-transitions.js';
import type { TaskSchedulerClusterState, TaskSchedulerSimEvent } from './task-scheduler/task-scheduler-types.js';

import { ChatPresenceInvariantChecker } from './chat-presence/chat-presence-invariants.js';
import { createDefaultChatPresenceCluster, pureChatPresenceTransition } from './chat-presence/chat-presence-state-transitions.js';
import type { ChatPresenceClusterState, ChatPresenceSimEvent } from './chat-presence/chat-presence-types.js';

import { FeatureStoreInvariantChecker } from './feature-store/feature-store-invariants.js';
import { createDefaultFeatureStoreCluster, pureFeatureStoreTransition } from './feature-store/feature-store-state-transitions.js';
import type { FeatureStoreClusterState, FeatureStoreSimEvent } from './feature-store/feature-store-types.js';

import { ModelRolloutInvariantChecker } from './model-rollout/model-rollout-invariants.js';
import { createDefaultModelRolloutCluster, pureModelRolloutTransition } from './model-rollout/model-rollout-state-transitions.js';
import type { ModelRolloutClusterState, ModelRolloutSimEvent } from './model-rollout/model-rollout-types.js';

import { LlmEvalInvariantChecker } from './llm-eval/llm-eval-invariants.js';
import { createDefaultLlmEvalCluster, pureLlmEvalTransition } from './llm-eval/llm-eval-state-transitions.js';
import type { LlmEvalClusterState, LlmEvalSimEvent } from './llm-eval/llm-eval-types.js';

import { ConsistentHashingInvariantChecker } from './consistent-hashing/consistent-hashing-invariants.js';
import { createDefaultConsistentHashingCluster, pureConsistentHashingTransition } from './consistent-hashing/consistent-hashing-state-transitions.js';
import type { ConsistentHashingClusterState, ConsistentHashingSimEvent } from './consistent-hashing/consistent-hashing-types.js';

import { ProbabilisticStructuresInvariantChecker } from './probabilistic-structures/probabilistic-structures-invariants.js';
import { createDefaultProbabilisticStructuresCluster, pureProbabilisticStructuresTransition } from './probabilistic-structures/probabilistic-structures-state-transitions.js';
import type {
  ProbabilisticStructuresClusterState,
  ProbabilisticStructuresSimEvent,
} from './probabilistic-structures/probabilistic-structures-types.js';

import { MerkleTreesInvariantChecker } from './merkle-trees/merkle-trees-invariants.js';
import { createDefaultMerkleTreesCluster, pureMerkleTreesTransition } from './merkle-trees/merkle-trees-state-transitions.js';
import type { MerkleTreesClusterState, MerkleTreesSimEvent } from './merkle-trees/merkle-trees-types.js';

export interface DomainPluginMetadata {
  id: string;
  name: string;
  version: string;
  category:
    | 'STREAMING'
    | 'CONSENSUS'
    | 'DATABASE'
    | 'CACHE'
    | 'ORCHESTRATION'
    | 'NETWORKING'
    | 'GATEWAY'
    | 'SYSTEM_DESIGN'
    | 'AI_INFRA'
    | 'ALGORITHMS';
  description: string;
  fidelityTag:
    'CONCEPTUAL' | 'BEHAVIORAL' | 'ORACLE_TESTED' | 'PROTOCOL_COMPATIBLE' | 'VERSION_COMPATIBLE';
  fidelityDisplayName?: string | undefined;
  oracleSystemName?: string | undefined;
  icon?: string | undefined;
  color?: string | undefined;
}

export interface DomainPlugin<TState = any, TEvent = any> {
  metadata: DomainPluginMetadata;
  createDefaultState: () => TState;
  reduceState: (
    state: TState,
    event: TEvent,
    rng: DeterministicRNG,
  ) => { nextState: TState; emittedEvents: TEvent[] };
  validateInvariants: (state: TState) => {
    passed: boolean;
    violation?: { name: string; description: string };
  };
  scenarioLibrary: any[];
  oracleAdapter?: any;
}

export const KafkaDomainPlugin: DomainPlugin<KafkaClusterState, SimEvent> = {
  metadata: {
    id: 'kafka',
    name: 'Apache Kafka',
    version: '4.3.0',
    category: 'STREAMING',
    description:
      'Distributed event streaming platform with KRaft consensus, partition replication, and consumer groups.',
    fidelityTag: 'ORACLE_TESTED',
    fidelityDisplayName: 'Kafka-tested',
  },
  createDefaultState: () => createDefaultBaselineState(),
  reduceState: (state, event, rng) => pureStateTransition(state, event, rng),
  validateInvariants: (state) => {
    const checker = new InvariantChecker();
    const violation = checker.check(state);
    if (violation) {
      return {
        passed: false,
        violation: {
          name: violation.invariantName,
          description: violation.description,
        },
      };
    }
    return { passed: true };
  },
  scenarioLibrary: [],
  oracleAdapter: new KafkaOracleHarness(),
};

export const RaftDomainPlugin: DomainPlugin<RaftClusterState, RaftSimEvent> = {
  metadata: {
    id: 'raft',
    name: 'Raft Consensus',
    version: '1.0.0',
    category: 'CONSENSUS',
    description:
      'Leader election, log replication, commit indices, and network partition split-brain resilience.',
    fidelityTag: 'ORACLE_TESTED',
    fidelityDisplayName: 'Raft-tested',
  },
  createDefaultState: () => createDefaultRaftCluster(),
  reduceState: (state, event, rng) => pureRaftTransition(state, event, rng),
  validateInvariants: (state) => {
    const checker = new RaftInvariantChecker();
    const violation = checker.check(state);
    if (violation) {
      return {
        passed: false,
        violation: {
          name: violation.invariantName,
          description: violation.description,
        },
      };
    }
    return { passed: true };
  },
  scenarioLibrary: RAFT_SCENARIOS,
};

export const DatabaseDomainPlugin: DomainPlugin<DBClusterState, DBSimEvent> = {
  metadata: {
    id: 'database',
    name: 'Distributed Database (ScyllaDB / Cassandra)',
    version: '1.0.0',
    category: 'DATABASE',
    description:
      'Consistent hash ring partitioning with vnodes, tunable quorum consistency (R + W > N), hinted handoffs, and read repair.',
    fidelityTag: 'ORACLE_TESTED',
    fidelityDisplayName: 'Cassandra-tested',
  },
  createDefaultState: () => createDefaultDBCluster(),
  reduceState: (state, event, rng) => pureDBTransition(state, event, rng),
  validateInvariants: (state) => {
    const checker = new DBInvariantChecker();
    const violation = checker.check(state);
    if (violation) {
      return {
        passed: false,
        violation: {
          name: violation.invariantName,
          description: violation.description,
        },
      };
    }
    return { passed: true };
  },
  scenarioLibrary: DB_SCENARIOS,
};

export const RedisDomainPlugin: DomainPlugin<RedisClusterState, RedisSimEvent> = {
  metadata: {
    id: 'redis',
    name: 'Redis Cluster (16,384 Slots & Eviction Engine)',
    version: '1.0.0',
    category: 'CACHE',
    description:
      '16,384 hash slots with CRC16 hashtags, primary/replica pairs, MOVED/ASK client redirects, and LRU/LFU/TTL eviction policies.',
    fidelityTag: 'ORACLE_TESTED',
    fidelityDisplayName: 'Redis-tested',
  },
  createDefaultState: () => createDefaultRedisCluster(),
  reduceState: (state, event, rng) => pureRedisTransition(state, event, rng),
  validateInvariants: (state) => {
    const checker = new RedisInvariantChecker();
    const violation = checker.check(state);
    if (violation) {
      return {
        passed: false,
        violation: {
          name: violation.invariantName,
          description: violation.description,
        },
      };
    }
    return { passed: true };
  },
  scenarioLibrary: REDIS_SCENARIOS,
};

export const KubernetesDomainPlugin: DomainPlugin<K8sClusterState, K8sSimEvent> = {
  metadata: {
    id: 'kubernetes',
    name: 'Kubernetes (Scheduler & Reconciliation Engine)',
    version: '1.0.0',
    category: 'ORCHESTRATION',
    description:
      'Two-phase pod scheduling (predicates/scoring), CPU/Memory bin-packing, rolling deployments, taints/tolerations, and declarative control loops.',
    fidelityTag: 'ORACLE_TESTED',
    fidelityDisplayName: 'K8s-tested',
    icon: '☸️',
    color: '#3b82f6',
  },
  createDefaultState: () => createDefaultK8sCluster(),
  reduceState: (state, event, rng) => pureK8sTransition(state, event, rng),
  validateInvariants: (state) => {
    const checker = new K8sInvariantChecker();
    const violation = checker.check(state);
    if (violation) {
      return {
        passed: false,
        violation: {
          name: violation.invariantName,
          description: violation.description,
        },
      };
    }
    return { passed: true };
  },
  scenarioLibrary: K8S_SCENARIOS,
};

export const RabbitMQDomainPlugin: DomainPlugin<RabbitClusterState, RabbitSimEvent> = {
  metadata: {
    id: 'rabbitmq',
    name: 'RabbitMQ (AMQP 0-9-1 Exchanges & Queues)',
    version: '1.0.0',
    category: 'STREAMING',
    description:
      'Direct/Fanout/Topic exchange routing with wildcards (*, #), Dead-Letter Exchanges (DLX), message acks/nacks, TTL, and prefetch QoS.',
    fidelityTag: 'ORACLE_TESTED',
    fidelityDisplayName: 'RabbitMQ-tested',
    icon: '🐇',
    color: '#f97316',
  },
  createDefaultState: () => createDefaultRabbitCluster(),
  reduceState: (state, event, rng) => pureRabbitTransition(state, event, rng),
  validateInvariants: (state) => {
    const checker = new RabbitInvariantChecker();
    const violation = checker.check(state);
    if (violation) {
      return {
        passed: false,
        violation: {
          name: violation.invariantName,
          description: violation.description,
        },
      };
    }
    return { passed: true };
  },
  scenarioLibrary: RABBITMQ_SCENARIOS,
};

export const StorageDomainPlugin: DomainPlugin<StorageEngineClusterState, StorageSimEvent> = {
  metadata: {
    id: 'storage',
    name: 'Storage Engine Internals (B+ Tree vs. LSM-Tree)',
    version: '1.0.0',
    category: 'DATABASE',
    description:
      'B+ Tree page splits/balancing (SQLite/PostgreSQL) vs. LSM-Tree MemTable flushes, immutable SSTables, Bloom filters, and Leveled Compaction (RocksDB/Cassandra).',
    fidelityTag: 'ORACLE_TESTED',
    fidelityDisplayName: 'SQLite-tested',
    icon: '💾',
    color: '#14b8a6',
  },
  createDefaultState: () => createDefaultStorageCluster(),
  reduceState: (state, event, rng) => pureStorageTransition(state, event, rng),
  validateInvariants: (state) => {
    const checker = new StorageInvariantChecker();
    const violation = checker.check(state);
    if (violation) {
      return {
        passed: false,
        violation: {
          name: violation.invariantName,
          description: violation.description,
        },
      };
    }
    return { passed: true };
  },
  scenarioLibrary: STORAGE_SCENARIOS,
};

export const NetworkingDomainPlugin: DomainPlugin<NetworkingClusterState, NetworkSimEvent> = {
  metadata: {
    id: 'networking',
    name: 'Networking Fundamentals (TCP Handshake & Congestion Control)',
    version: '1.0.0',
    category: 'NETWORKING',
    description:
      'Packet-level simulation of TCP 3-way handshake (SYN -> SYN-ACK -> ACK), sliding window sequence numbering, packet drop retransmissions, and AIMD congestion control.',
    fidelityTag: 'ORACLE_TESTED',
    fidelityDisplayName: 'RFC-tested',
    icon: '🌐',
    color: '#06b6d4',
  },
  createDefaultState: () => createDefaultNetworkingCluster(),
  reduceState: (state, event, rng) => pureNetworkingTransition(state, event, rng),
  validateInvariants: (state) => {
    const checker = new NetworkInvariantChecker();
    const violation = checker.check(state);
    if (violation) {
      return {
        passed: false,
        violation: {
          name: violation.invariantName,
          description: violation.description,
        },
      };
    }
    return { passed: true };
  },
  scenarioLibrary: NETWORKING_SCENARIOS,
};

export const RateLimiterDomainPlugin: DomainPlugin<RateLimiterClusterState, RateLimiterSimEvent> = {
  metadata: {
    id: 'rate-limiter',
    name: 'Rate Limiter (Token, Leaky, Sliding Window)',
    version: '1.0.0',
    category: 'GATEWAY',
    description:
      'Comparative rate limiting algorithms: Token Bucket (RFC 2697), Leaky Bucket, Fixed Window boundary bursts, Sliding Window Log, and Cloudflare Sliding Window Counter.',
    fidelityTag: 'PROTOCOL_COMPATIBLE',
    fidelityDisplayName: 'RFC/Cloudflare',
    icon: '⏱️',
    color: '#f59e0b',
  },
  createDefaultState: () => createDefaultRateLimiterCluster(),
  reduceState: (state, event, rng) => pureRateLimiterTransition(state, event, rng),
  validateInvariants: (state) => {
    const checker = new RateLimiterInvariantChecker();
    const violation = checker.check(state);
    if (violation && !violation.isPedagogicalFlaw) {
      return {
        passed: false,
        violation: { name: violation.invariantName, description: violation.description },
      };
    }
    return { passed: true };
  },
  scenarioLibrary: [],
};

export const DistributedLockDomainPlugin: DomainPlugin<
  DistributedLockClusterState,
  DistributedLockSimEvent
> = {
  metadata: {
    id: 'distributed-lock',
    name: 'Distributed Lock Manager (Redlock & Fencing)',
    version: '1.0.0',
    category: 'CONSENSUS',
    description:
      'Redlock multi-node quorum consensus vs Raft lease authority, demonstrating the Martin Kleppmann GC-pause mutual exclusion hazard and downstream fencing token enforcement.',
    fidelityTag: 'PROTOCOL_COMPATIBLE',
    fidelityDisplayName: 'Redlock/Kleppmann',
    icon: '🔒',
    color: '#ef4444',
  },
  createDefaultState: () => createDefaultDistributedLockCluster(),
  reduceState: (state, event, rng) => pureDistributedLockTransition(state, event, rng),
  validateInvariants: (state) => {
    const checker = new DistributedLockInvariantChecker();
    const violation = checker.check(state);
    if (violation && !violation.isPedagogicalFlaw) {
      return {
        passed: false,
        violation: { name: violation.invariantName, description: violation.description },
      };
    }
    return { passed: true };
  },
  scenarioLibrary: [],
};

export const CdnCacheDomainPlugin: DomainPlugin<CdnCacheClusterState, CdnCacheSimEvent> = {
  metadata: {
    id: 'cdn-cache',
    name: 'CDN & Multi-Tier Caching (RFC 9111)',
    version: '1.0.0',
    category: 'CACHE',
    description:
      'Tiered edge-to-origin caching with RFC 9111 HTTP semantics (max-age, stale-while-revalidate, ETag revalidation), request coalescing, and edge fleet invalidation purges.',
    fidelityTag: 'PROTOCOL_COMPATIBLE',
    fidelityDisplayName: 'RFC 9111',
    icon: '⚡',
    color: '#3b82f6',
  },
  createDefaultState: () => createDefaultCdnCacheCluster(),
  reduceState: (state, event, rng) => pureCdnCacheTransition(state, event, rng),
  validateInvariants: (state) => {
    const checker = new CdnCacheInvariantChecker();
    const violation = checker.check(state);
    if (violation && !violation.isPedagogicalFlaw) {
      return {
        passed: false,
        violation: { name: violation.invariantName, description: violation.description },
      };
    }
    return { passed: true };
  },
  scenarioLibrary: [],
};

export const IdGenDomainPlugin: DomainPlugin<IdGenClusterState, IdGenSimEvent> = {
  metadata: {
    id: 'id-gen',
    name: 'Distributed ID Generation (Snowflake & UUIDv7)',
    version: '1.0.0',
    category: 'DATABASE',
    description:
      '64-bit Twitter Snowflake ID generation with bit-field decomposition, RFC 9562 UUIDv7 k-sortability, NTP backward clock-regression safety guards, and sequence overflow rollover.',
    fidelityTag: 'PROTOCOL_COMPATIBLE',
    fidelityDisplayName: 'Snowflake/RFC 9562',
    icon: '🆔',
    color: '#8b5cf6',
  },
  createDefaultState: () => createDefaultIdGenCluster(),
  reduceState: (state, event, rng) => pureIdGenTransition(state, event, rng),
  validateInvariants: (state) => {
    const checker = new IdGenInvariantChecker();
    const violation = checker.check(state);
    if (violation && !violation.isPedagogicalFlaw) {
      return {
        passed: false,
        violation: { name: violation.invariantName, description: violation.description },
      };
    }
    return { passed: true };
  },
  scenarioLibrary: [],
};

export const TransactionsDomainPlugin: DomainPlugin<
  TransactionsClusterState,
  TransactionsSimEvent
> = {
  metadata: {
    id: 'transactions',
    name: 'Distributed Transactions (2PC & Saga)',
    version: '1.0.0',
    category: 'CONSENSUS',
    description:
      'Two-Phase Commit (2PC) with coordinator-crash blocking hazard demonstration, contrasted with Saga pattern orchestration and reverse-LIFO compensating transactions.',
    fidelityTag: 'PROTOCOL_COMPATIBLE',
    fidelityDisplayName: 'Gray 1978 / Sagas',
    icon: '💳',
    color: '#10b981',
  },
  createDefaultState: () => createDefaultTransactionsCluster(),
  reduceState: (state, event, rng) => pureTransactionsTransition(state, event, rng),
  validateInvariants: (state) => {
    const checker = new TransactionsInvariantChecker();
    const violation = checker.check(state);
    if (violation && !violation.isPedagogicalFlaw) {
      return {
        passed: false,
        violation: { name: violation.invariantName, description: violation.description },
      };
    }
    return { passed: true };
  },
  scenarioLibrary: [],
};


export const LLMServingDomainPlugin: DomainPlugin<LLMServingClusterState, LLMServingSimEvent> = {
  metadata: {
    id: 'llm-serving',
    name: 'LLM Inference Serving (PagedAttention)',
    version: '1.0.0',
    category: 'AI_INFRA',
    description:
      'vLLM PagedAttention GPU KV-cache virtual memory allocator, Orca continuous batching prefill/decode scheduling, and Speculative Decoding verifier.',
    fidelityTag: 'PROTOCOL_COMPATIBLE',
    fidelityDisplayName: 'vLLM / Orca SOSP \'23',
    icon: '⚡',
    color: '#10b981',
  },
  createDefaultState: () => createDefaultLLMServingCluster(),
  reduceState: (state, event, rng) => pureLLMServingTransition(state, event, rng),
  validateInvariants: (state) => {
    const checker = new LLMServingInvariantChecker();
    const violation = checker.check(state);
    if (violation && !violation.isPedagogicalFlaw) {
      return {
        passed: false,
        violation: { name: violation.invariantName, description: violation.description },
      };
    }
    return { passed: true };
  },
  scenarioLibrary: [],
};

export const VectorDBDomainPlugin: DomainPlugin<VectorDBClusterState, VectorDBSimEvent> = {
  metadata: {
    id: 'vectordb',
    name: 'Vector Database (HNSW & IVF-PQ)',
    version: '1.0.0',
    category: 'AI_INFRA',
    description:
      'Multi-layer Hierarchical Navigable Small World (HNSW) graph with greedy beam routing, Inverted File Product Quantization (IVF-PQ) Voronoi cell space partitioning, and recall gauges.',
    fidelityTag: 'PROTOCOL_COMPATIBLE',
    fidelityDisplayName: 'HNSW / IVF-PQ',
    icon: '🧭',
    color: '#f59e0b',
  },
  createDefaultState: () => createDefaultVectorDBCluster(),
  reduceState: (state, event, rng) => pureVectorDBTransition(state, event, rng),
  validateInvariants: (state) => {
    const checker = new VectorDBInvariantChecker();
    const violation = checker.check(state);
    if (violation && !violation.isPedagogicalFlaw) {
      return {
        passed: false,
        violation: { name: violation.invariantName, description: violation.description },
      };
    }
    return { passed: true };
  },
  scenarioLibrary: [],
};

export const GPUClusterDomainPlugin: DomainPlugin<GPUClusterState, GPUClusterSimEvent> = {
  metadata: {
    id: 'gpu-cluster',
    name: 'GPU Cluster & 3D Parallelism',
    version: '1.0.0',
    category: 'AI_INFRA',
    description:
      'Megatron-LM 3D Parallelism (TP x PP x DP), DeepSpeed ZeRO-1/2/3 memory sharding, 1F1B pipeline microbatch schedule Gantt waterfall, and Ring-AllReduce circular gradient sync.',
    fidelityTag: 'PROTOCOL_COMPATIBLE',
    fidelityDisplayName: 'Megatron-LM / ZeRO',
    icon: '🖥️',
    color: '#ec4899',
  },
  createDefaultState: () => createDefaultGPUCluster(),
  reduceState: (state, event, rng) => pureGPUClusterTransition(state, event, rng),
  validateInvariants: (state) => {
    const checker = new GPUClusterInvariantChecker();
    const violation = checker.check(state);
    if (violation && !violation.isPedagogicalFlaw) {
      return {
        passed: false,
        violation: { name: violation.invariantName, description: violation.description },
      };
    }
    return { passed: true };
  },
  scenarioLibrary: [],
};

export const LlmPipelineDomainPlugin: DomainPlugin<LlmPipelineClusterState, LlmPipelineSimEvent> = {
  metadata: {
    id: 'llm-pipeline',
    name: 'LLM Pipeline & Lineage',
    version: '1.0.0',
    category: 'AI_INFRA',
    description:
      'ETL document chunking, dense + BM25 hybrid search with RRF fusion, agentic tool DAG execution, and W3C PROV end-to-end lineage traceability.',
    fidelityTag: 'PROTOCOL_COMPATIBLE',
    fidelityDisplayName: 'OpenLineage / W3C PROV / RRF',
    icon: '🧬',
    color: '#06b6d4',
  },
  createDefaultState: () => createDefaultLlmPipelineCluster(),
  reduceState: (state, event, rng) => pureLlmPipelineTransition(state, event, rng),
  validateInvariants: (state) => {
    const checker = new LlmPipelineInvariantChecker();
    const violation = checker.check(state);
    if (violation) {
      return {
        passed: false,
        violation: { name: violation.invariantName, description: violation.description },
      };
    }
    return { passed: true };
  },
  scenarioLibrary: [],
};

export const LlmGatewayDomainPlugin: DomainPlugin<LlmGatewayClusterState, LlmGatewaySimEvent> = {
  metadata: {
    id: 'llm-gateway',
    name: 'LLM Gateway & Guardrails',
    version: '1.0.0',
    category: 'GATEWAY',
    description:
      'Multi-provider fallback routing with circuit breakers (CLOSED/OPEN/HALF_OPEN), cosine semantic caching, and pre-execution adversarial injection guardrails.',
    fidelityTag: 'PROTOCOL_COMPATIBLE',
    fidelityDisplayName: 'Martin Fowler FSM / Cosine Cache / Guardrails',
    icon: '🛡️',
    color: '#3b82f6',
  },
  createDefaultState: () => createDefaultLlmGatewayCluster(),
  reduceState: (state, event, rng) => pureLlmGatewayTransition(state, event, rng),
  validateInvariants: (state) => {
    const checker = new LlmGatewayInvariantChecker();
    const violation = checker.check(state);
    if (violation) {
      return {
        passed: false,
        violation: { name: violation.invariantName, description: violation.description },
      };
    }
    return { passed: true };
  },
  scenarioLibrary: [],
};

export const LoadBalancerDomainPlugin: DomainPlugin<LBClusterState, LBSimEvent> = {
  metadata: {
    id: 'load-balancer',
    name: 'Load Balancer (L4/L7 Routing & Health Checks)',
    version: '1.0.0',
    category: 'SYSTEM_DESIGN',
    description:
      'Round robin, smooth weighted round robin (nginx), least connections, least response time (EWMA), and consistent-hash sticky sessions with active health checking and graceful connection draining.',
    fidelityTag: 'PROTOCOL_COMPATIBLE',
    fidelityDisplayName: 'HAProxy / nginx / ALB',
    icon: '⚖️',
    color: '#3b82f6',
  },
  createDefaultState: () => createDefaultLBCluster(),
  reduceState: (state, event, rng) => pureLBTransition(state, event, rng),
  validateInvariants: (state) => {
    const checker = new LBInvariantChecker();
    const violation = checker.check(state);
    if (violation) {
      return {
        passed: false,
        violation: { name: violation.invariantName, description: violation.description },
      };
    }
    return { passed: true };
  },
  scenarioLibrary: [],
};

export const SearchIndexDomainPlugin: DomainPlugin<SearchIndexClusterState, SearchIndexSimEvent> = {
  metadata: {
    id: 'search-index',
    name: 'Distributed Search & Inverted Index (BM25)',
    version: '1.0.0',
    category: 'SYSTEM_DESIGN',
    description:
      'Analyzer pipeline, inverted index construction with posting lists, real BM25 relevance scoring (Robertson & Zaragoza / Lucene formula with per-term breakdown), sharding with replicas, and scatter-gather query fan-out.',
    fidelityTag: 'PROTOCOL_COMPATIBLE',
    fidelityDisplayName: 'Elasticsearch / Lucene BM25',
    icon: '🔍',
    color: '#f59e0b',
  },
  createDefaultState: () => createDefaultSearchIndexCluster(),
  reduceState: (state, event, rng) => pureSearchIndexTransition(state, event, rng),
  validateInvariants: (state) => {
    const checker = new SearchIndexInvariantChecker();
    const violation = checker.check(state);
    if (violation) {
      return {
        passed: false,
        violation: { name: violation.invariantName, description: violation.description },
      };
    }
    return { passed: true };
  },
  scenarioLibrary: [],
};

export const TaskSchedulerDomainPlugin: DomainPlugin<TaskSchedulerClusterState, TaskSchedulerSimEvent> = {
  metadata: {
    id: 'task-scheduler',
    name: 'Distributed Task Scheduler & Cron (DAG)',
    version: '1.0.0',
    category: 'SYSTEM_DESIGN',
    description:
      'Leader-elected dispatcher with a lease (single active scheduler), exactly-once dispatch via idempotency keys, DAG dependency ordering with upstream-failure skips, and retries with exponential backoff and jitter (Brooker 2015).',
    fidelityTag: 'PROTOCOL_COMPATIBLE',
    fidelityDisplayName: 'Chronos / Airflow',
    icon: '⏰',
    color: '#10b981',
  },
  createDefaultState: () => createDefaultTaskSchedulerCluster(),
  reduceState: (state, event, rng) => pureTaskSchedulerTransition(state, event, rng),
  validateInvariants: (state) => {
    const checker = new TaskSchedulerInvariantChecker();
    const violation = checker.check(state);
    if (violation) {
      return {
        passed: false,
        violation: { name: violation.invariantName, description: violation.description },
      };
    }
    return { passed: true };
  },
  scenarioLibrary: [],
};

export const ChatPresenceDomainPlugin: DomainPlugin<ChatPresenceClusterState, ChatPresenceSimEvent> = {
  metadata: {
    id: 'chat-presence',
    name: 'Real-Time Chat & Presence (WebSocket)',
    version: '1.0.0',
    category: 'SYSTEM_DESIGN',
    description:
      'Sequence-number message ordering with client-side reordering and dedup (at-least-once delivery), presence staleness bounds (ONLINE/AWAY/OFFLINE), fanout completeness with offline queuing, and TTL-based typing indicators.',
    fidelityTag: 'PROTOCOL_COMPATIBLE',
    fidelityDisplayName: 'RFC 6455 / DDIA ch. 8',
    icon: '💬',
    color: '#06b6d4',
  },
  createDefaultState: () => createDefaultChatPresenceCluster(),
  reduceState: (state, event, rng) => pureChatPresenceTransition(state, event, rng),
  validateInvariants: (state) => {
    const checker = new ChatPresenceInvariantChecker();
    const violation = checker.check(state);
    if (violation) {
      return {
        passed: false,
        violation: { name: violation.invariantName, description: violation.description },
      };
    }
    return { passed: true };
  },
  scenarioLibrary: [],
};

export const FeatureStoreDomainPlugin: DomainPlugin<FeatureStoreClusterState, FeatureStoreSimEvent> = {
  metadata: {
    id: 'feature-store',
    name: 'ML Feature Store (Offline/Online PIT Joins)',
    version: '1.0.0',
    category: 'AI_INFRA',
    description:
      'Point-in-time-correct training-set joins (no label leakage), offline/online consistency at the sync watermark, staleness TTL flags, and versioned feature definitions that never mutate materialized data.',
    fidelityTag: 'PROTOCOL_COMPATIBLE',
    fidelityDisplayName: 'Feast / Tecton / Michelangelo',
    icon: '🗄️',
    color: '#8b5cf6',
  },
  createDefaultState: () => createDefaultFeatureStoreCluster(),
  reduceState: (state, event, rng) => pureFeatureStoreTransition(state, event, rng),
  validateInvariants: (state) => {
    const checker = new FeatureStoreInvariantChecker();
    const violation = checker.check(state);
    if (violation) {
      return {
        passed: false,
        violation: { name: violation.invariantName, description: violation.description },
      };
    }
    return { passed: true };
  },
  scenarioLibrary: [],
};

export const ModelRolloutDomainPlugin: DomainPlugin<ModelRolloutClusterState, ModelRolloutSimEvent> = {
  metadata: {
    id: 'model-rollout',
    name: 'Model Deployment & Canary Rollout',
    version: '1.0.0',
    category: 'AI_INFRA',
    description:
      'Model registry staging with shadow traffic (zero client impact), percentage canary with statistical split bounds, automatic metric-threshold rollback, and two-proportion z-test significance-gated promotion blocked by the eval gate.',
    fidelityTag: 'PROTOCOL_COMPATIBLE',
    fidelityDisplayName: 'Argo Rollouts / Flagger',
    icon: '🚀',
    color: '#ec4899',
  },
  createDefaultState: () => createDefaultModelRolloutCluster(),
  reduceState: (state, event, rng) => pureModelRolloutTransition(state, event, rng),
  validateInvariants: (state) => {
    const checker = new ModelRolloutInvariantChecker();
    const violation = checker.check(state);
    if (violation) {
      return {
        passed: false,
        violation: { name: violation.invariantName, description: violation.description },
      };
    }
    return { passed: true };
  },
  scenarioLibrary: [],
};

export const LlmEvalDomainPlugin: DomainPlugin<LlmEvalClusterState, LlmEvalSimEvent> = {
  metadata: {
    id: 'llm-eval',
    name: 'LLM Evaluation & Guardrails Pipeline',
    version: '1.0.0',
    category: 'AI_INFRA',
    description:
      'Offline eval suite scoring with deterministic scripted model profiles, red-team regression detection across versions, version-pinned guardrail policy re-scoring, and the deployment gate that blocks Critical-failing versions in /model-rollout.',
    fidelityTag: 'PROTOCOL_COMPATIBLE',
    fidelityDisplayName: 'HELM / OpenAI Evals / NeMo',
    icon: '🧪',
    color: '#ef4444',
  },
  createDefaultState: () => createDefaultLlmEvalCluster(),
  reduceState: (state, event, rng) => pureLlmEvalTransition(state, event, rng),
  validateInvariants: (state) => {
    const checker = new LlmEvalInvariantChecker();
    const violation = checker.check(state);
    if (violation) {
      return {
        passed: false,
        violation: { name: violation.invariantName, description: violation.description },
      };
    }
    return { passed: true };
  },
  scenarioLibrary: [],
};

export const ConsistentHashingDomainPlugin: DomainPlugin<ConsistentHashingClusterState, ConsistentHashingSimEvent> = {
  metadata: {
    id: 'consistent-hashing',
    name: 'Consistent Hashing (Ring, Jump, Rendezvous)',
    version: '1.0.0',
    category: 'ALGORITHMS',
    description:
      'Ring-based consistent hashing with virtual nodes (Karger et al. 1997), Jump Consistent Hash (Lamping & Veach 2014, growth-only monotonicity), and Rendezvous/HRW hashing — compared live against the naive hash % N baseline on identical add/remove events.',
    fidelityTag: 'PROTOCOL_COMPATIBLE',
    fidelityDisplayName: 'Karger STOC \'97 / Lamping-Veach / HRW',
    icon: '🌀',
    color: '#f59e0b',
  },
  createDefaultState: () => createDefaultConsistentHashingCluster(),
  reduceState: (state, event, rng) => pureConsistentHashingTransition(state, event, rng),
  validateInvariants: (state) => {
    const checker = new ConsistentHashingInvariantChecker();
    const violation = checker.check(state);
    if (violation) {
      return {
        passed: false,
        violation: { name: violation.invariantName, description: violation.description },
      };
    }
    return { passed: true };
  },
  scenarioLibrary: [],
};

export const ProbabilisticStructuresDomainPlugin: DomainPlugin<
  ProbabilisticStructuresClusterState,
  ProbabilisticStructuresSimEvent
> = {
  metadata: {
    id: 'probabilistic-structures',
    name: 'Bloom Filters & Probabilistic Structures',
    version: '1.0.0',
    category: 'ALGORITHMS',
    description:
      'Standard Bloom, Counting Bloom, Cuckoo (with full rollback kick chains), HyperLogLog (1.04/sqrt(m) standard error), and Count-Min Sketch fed an identical stream with live memory-vs-accuracy comparison and one-sided-error guarantees.',
    fidelityTag: 'PROTOCOL_COMPATIBLE',
    fidelityDisplayName: 'Bloom / Fan / Flajolet / Cormode',
    icon: '🎲',
    color: '#10b981',
  },
  createDefaultState: () => createDefaultProbabilisticStructuresCluster(),
  reduceState: (state, event, rng) => pureProbabilisticStructuresTransition(state, event, rng),
  validateInvariants: (state) => {
    const checker = new ProbabilisticStructuresInvariantChecker();
    const violation = checker.check(state);
    if (violation) {
      return {
        passed: false,
        violation: { name: violation.invariantName, description: violation.description },
      };
    }
    return { passed: true };
  },
  scenarioLibrary: [],
};

export const MerkleTreesDomainPlugin: DomainPlugin<MerkleTreesClusterState, MerkleTreesSimEvent> = {
  metadata: {
    id: 'merkle-trees',
    name: 'Merkle Trees & Distributed Verification',
    version: '1.0.0',
    category: 'ALGORITHMS',
    description:
      'Bottom-up tree-hash construction with leaf proofs (verify/tamper both directions), instrumented anti-entropy divergence localization (O(divergence x depth) vs full scan), and a Merkle-Patricia trie with membership AND non-membership proofs.',
    fidelityTag: 'PROTOCOL_COMPATIBLE',
    fidelityDisplayName: 'Merkle 1979 / Dynamo / Ethereum MPT',
    icon: '🌳',
    color: '#06b6d4',
  },
  createDefaultState: () => createDefaultMerkleTreesCluster(),
  reduceState: (state, event, rng) => pureMerkleTreesTransition(state, event, rng),
  validateInvariants: (state) => {
    const checker = new MerkleTreesInvariantChecker();
    const violation = checker.check(state);
    if (violation) {
      return {
        passed: false,
        violation: { name: violation.invariantName, description: violation.description },
      };
    }
    return { passed: true };
  },
  scenarioLibrary: [],
};

export class DomainRegistry {
  private static readonly plugins = new Map<string, DomainPlugin>([
    ['kafka', KafkaDomainPlugin],
    ['raft', RaftDomainPlugin],
    ['database', DatabaseDomainPlugin],
    ['redis', RedisDomainPlugin],
    ['kubernetes', KubernetesDomainPlugin],
    ['rabbitmq', RabbitMQDomainPlugin],
    ['storage', StorageDomainPlugin],
    ['networking', NetworkingDomainPlugin],
    ['rate-limiter', RateLimiterDomainPlugin],
    ['distributed-lock', DistributedLockDomainPlugin],
    ['cdn-cache', CdnCacheDomainPlugin],
    ['id-gen', IdGenDomainPlugin],
    ['transactions', TransactionsDomainPlugin],
    ['llm-pipeline', LlmPipelineDomainPlugin],
    ['llm-gateway', LlmGatewayDomainPlugin],
    ['llm-serving', LLMServingDomainPlugin],
    ['vectordb', VectorDBDomainPlugin],
    ['gpu-cluster', GPUClusterDomainPlugin],
    ['load-balancer', LoadBalancerDomainPlugin],
    ['search-index', SearchIndexDomainPlugin],
    ['task-scheduler', TaskSchedulerDomainPlugin],
    ['chat-presence', ChatPresenceDomainPlugin],
    ['feature-store', FeatureStoreDomainPlugin],
    ['model-rollout', ModelRolloutDomainPlugin],
    ['llm-eval', LlmEvalDomainPlugin],
    ['consistent-hashing', ConsistentHashingDomainPlugin],
    ['probabilistic-structures', ProbabilisticStructuresDomainPlugin],
    ['merkle-trees', MerkleTreesDomainPlugin],
  ]);

  public static register(plugin: DomainPlugin): void {
    this.plugins.set(plugin.metadata.id, plugin);
  }

  public static get(id: string): DomainPlugin | undefined {
    return this.plugins.get(id);
  }

  public static list(): DomainPluginMetadata[] {
    return Array.from(this.plugins.values()).map((p) => p.metadata);
  }
}
