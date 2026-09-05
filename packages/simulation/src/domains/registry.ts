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

import { RAGInvariantChecker } from './rag/rag-invariants.js';
import { createDefaultRAGCluster, pureRAGTransition } from './rag/rag-state-transitions.js';
import type { RAGClusterState, RAGSimEvent } from './rag/rag-types.js';

import { AgentsInvariantChecker } from './agents/agents-invariants.js';
import { createDefaultAgentsCluster, pureAgentsTransition } from './agents/agents-state-transitions.js';
import type { AgentsClusterState, AgentsSimEvent } from './agents/agents-types.js';

import { LLMServingInvariantChecker } from './llm-serving/llm-serving-invariants.js';
import { createDefaultLLMServingCluster, pureLLMServingTransition } from './llm-serving/llm-serving-state-transitions.js';
import type { LLMServingClusterState, LLMServingSimEvent } from './llm-serving/llm-serving-types.js';

import { VectorDBInvariantChecker } from './vectordb/vectordb-invariants.js';
import { createDefaultVectorDBCluster, pureVectorDBTransition } from './vectordb/vectordb-state-transitions.js';
import type { VectorDBClusterState, VectorDBSimEvent } from './vectordb/vectordb-types.js';

import { GPUClusterInvariantChecker } from './gpu-cluster/gpu-cluster-invariants.js';
import { createDefaultGPUCluster, pureGPUClusterTransition } from './gpu-cluster/gpu-cluster-state-transitions.js';
import type { GPUClusterState, GPUClusterSimEvent } from './gpu-cluster/gpu-cluster-types.js';

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
    | 'AI_INFRA';
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

export const RAGDomainPlugin: DomainPlugin<RAGClusterState, RAGSimEvent> = {
  metadata: {
    id: 'rag',
    name: 'Retrieval-Augmented Generation (RAG)',
    version: '1.0.0',
    category: 'AI_INFRA',
    description:
      'Modular RAG with Dense Passage Retrieval, sparse BM25 lexical matching, Reciprocal Rank Fusion (RRF), Cross-Encoder re-ranking, and Lost-in-the-Middle context packing.',
    fidelityTag: 'PROTOCOL_COMPATIBLE',
    fidelityDisplayName: 'Modular RAG / RRF',
    icon: '📚',
    color: '#3b82f6',
  },
  createDefaultState: () => createDefaultRAGCluster(),
  reduceState: (state, event, rng) => pureRAGTransition(state, event, rng),
  validateInvariants: (state) => {
    const checker = new RAGInvariantChecker();
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

export const AgentsDomainPlugin: DomainPlugin<AgentsClusterState, AgentsSimEvent> = {
  metadata: {
    id: 'agents',
    name: 'Multi-Agent MCP Swarms',
    version: '1.0.0',
    category: 'AI_INFRA',
    description:
      'Multi-agent ReAct orchestration, Model Context Protocol (MCP) JSON-RPC 2.0 tool transport, hierarchical supervision, and acyclic loop cycle guards.',
    fidelityTag: 'PROTOCOL_COMPATIBLE',
    fidelityDisplayName: 'MCP 2024-11-05 / ReAct',
    icon: '🤖',
    color: '#8b5cf6',
  },
  createDefaultState: () => createDefaultAgentsCluster(),
  reduceState: (state, event, rng) => pureAgentsTransition(state, event, rng),
  validateInvariants: (state) => {
    const checker = new AgentsInvariantChecker();
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
    ['rag', RAGDomainPlugin],
    ['agents', AgentsDomainPlugin],
    ['llm-serving', LLMServingDomainPlugin],
    ['vectordb', VectorDBDomainPlugin],
    ['gpu-cluster', GPUClusterDomainPlugin],
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
