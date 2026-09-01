import { InvariantChecker } from '../invariants/invariant-checker.js';
import { pureStateTransition } from '../engine/state-transitions.js';
import type { KafkaClusterState, SimEvent } from '../engine/types.js';
import { createDefaultBaselineState } from '../reconstitution/event-log-parser.js';
import { DeterministicRNG } from '../prng/deterministic-rng.js';
import { RaftInvariantChecker } from './raft/raft-invariants.js';
import { RAFT_SCENARIOS } from './raft/raft-scenarios.js';
import {
  createDefaultRaftCluster,
  pureRaftTransition,
} from './raft/raft-state-transitions.js';
import type { RaftClusterState, RaftSimEvent } from './raft/raft-types.js';

export interface DomainPluginMetadata {
  id: string;
  name: string;
  version: string;
  category: 'STREAMING' | 'CONSENSUS' | 'DATABASE' | 'CACHE' | 'ORCHESTRATION' | 'NETWORKING';
  description: string;
  fidelityTag: 'CONCEPTUAL' | 'BEHAVIORAL' | 'ORACLE_TESTED' | 'PROTOCOL_COMPATIBLE' | 'VERSION_COMPATIBLE';
  oracleSystemName?: string | undefined;
  icon?: string | undefined;
  color?: string | undefined;
}

export interface DomainPlugin<TState = any, TEvent = any> {
  metadata: DomainPluginMetadata;
  createDefaultState: () => TState;
  reduceState: (state: TState, event: TEvent, rng: DeterministicRNG) => { nextState: TState; emittedEvents: TEvent[] };
  validateInvariants: (state: TState) => { passed: boolean; violation?: { name: string; description: string } };
  scenarioLibrary: any[];
}

export const KafkaDomainPlugin: DomainPlugin<KafkaClusterState, SimEvent> = {
  metadata: {
    id: 'kafka',
    name: 'Apache Kafka',
    version: '4.3.0',
    category: 'STREAMING',
    description: 'Distributed event streaming platform with KRaft consensus, partition replication, and consumer groups.',
    fidelityTag: 'ORACLE_TESTED',
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
};

export const RaftDomainPlugin: DomainPlugin<RaftClusterState, RaftSimEvent> = {
  metadata: {
    id: 'raft',
    name: 'Raft Consensus',
    version: '1.0.0',
    category: 'CONSENSUS',
    description: 'Leader election, log replication, commit indices, and network partition split-brain resilience.',
    fidelityTag: 'ORACLE_TESTED',
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

import { DBInvariantChecker } from './database/db-invariants.js';
import { DB_SCENARIOS } from './database/db-scenarios.js';
import {
  createDefaultDBCluster,
  pureDBTransition,
} from './database/db-state-transitions.js';
import type { DBClusterState, DBSimEvent } from './database/db-types.js';

export const DatabaseDomainPlugin: DomainPlugin<DBClusterState, DBSimEvent> = {
  metadata: {
    id: 'database',
    name: 'Distributed Database (ScyllaDB / Cassandra)',
    version: '1.0.0',
    category: 'DATABASE',
    description: 'Consistent hash ring partitioning with vnodes, tunable quorum consistency (R + W > N), hinted handoffs, and read repair.',
    fidelityTag: 'ORACLE_TESTED',
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

import { RedisInvariantChecker } from './redis/redis-invariants.js';
import { REDIS_SCENARIOS } from './redis/redis-scenarios.js';
import {
  createDefaultRedisCluster,
  pureRedisTransition,
} from './redis/redis-state-transitions.js';
import type { RedisClusterState, RedisSimEvent } from './redis/redis-types.js';

export const RedisDomainPlugin: DomainPlugin<RedisClusterState, RedisSimEvent> = {
  metadata: {
    id: 'redis',
    name: 'Redis Cluster (16,384 Slots & Eviction Engine)',
    version: '1.0.0',
    category: 'CACHE',
    description: '16,384 hash slots with CRC16 hashtags, primary/replica pairs, MOVED/ASK client redirects, and LRU/LFU/TTL eviction policies.',
    fidelityTag: 'ORACLE_TESTED',
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

import { K8sInvariantChecker } from './kubernetes/k8s-invariants.js';
import { K8S_SCENARIOS } from './kubernetes/k8s-scenarios.js';
import {
  createDefaultK8sCluster,
  pureK8sTransition,
} from './kubernetes/k8s-state-transitions.js';
import type { K8sClusterState, K8sSimEvent } from './kubernetes/k8s-types.js';

export const KubernetesDomainPlugin: DomainPlugin<K8sClusterState, K8sSimEvent> = {
  metadata: {
    id: 'kubernetes',
    name: 'Kubernetes (Scheduler & Reconciliation Engine)',
    version: '1.0.0',
    category: 'ORCHESTRATION',
    description: 'Two-phase pod scheduling (predicates/scoring), CPU/Memory bin-packing, rolling deployments, taints/tolerations, and declarative control loops.',
    fidelityTag: 'ORACLE_TESTED',
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

import { RabbitInvariantChecker } from './rabbitmq/rabbitmq-invariants.js';
import { RABBITMQ_SCENARIOS } from './rabbitmq/rabbitmq-scenarios.js';
import {
  createDefaultRabbitCluster,
  pureRabbitTransition,
} from './rabbitmq/rabbitmq-state-transitions.js';
import type { RabbitClusterState, RabbitSimEvent } from './rabbitmq/rabbitmq-types.js';

export const RabbitMQDomainPlugin: DomainPlugin<RabbitClusterState, RabbitSimEvent> = {
  metadata: {
    id: 'rabbitmq',
    name: 'RabbitMQ (AMQP 0-9-1 Exchanges & Queues)',
    version: '1.0.0',
    category: 'STREAMING',
    description: 'Direct/Fanout/Topic exchange routing with wildcards (*, #), Dead-Letter Exchanges (DLX), message acks/nacks, TTL, and prefetch QoS.',
    fidelityTag: 'ORACLE_TESTED',
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

import { StorageInvariantChecker } from './storage/storage-invariants.js';
import { STORAGE_SCENARIOS } from './storage/storage-scenarios.js';
import {
  createDefaultStorageCluster,
  pureStorageTransition,
} from './storage/storage-state-transitions.js';
import type { StorageEngineClusterState, StorageSimEvent } from './storage/storage-types.js';

export const StorageDomainPlugin: DomainPlugin<StorageEngineClusterState, StorageSimEvent> = {
  metadata: {
    id: 'storage',
    name: 'Storage Engine Internals (B+ Tree vs. LSM-Tree)',
    version: '1.0.0',
    category: 'DATABASE',
    description: 'B+ Tree page splits/balancing (SQLite/PostgreSQL) vs. LSM-Tree MemTable flushes, immutable SSTables, Bloom filters, and Leveled Compaction (RocksDB/Cassandra).',
    fidelityTag: 'ORACLE_TESTED',
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

import { NetworkInvariantChecker } from './networking/networking-invariants.js';
import { NETWORKING_SCENARIOS } from './networking/networking-scenarios.js';
import {
  createDefaultNetworkingCluster,
  pureNetworkingTransition,
} from './networking/networking-state-transitions.js';
import type { NetworkingClusterState, NetworkSimEvent } from './networking/networking-types.js';

export const NetworkingDomainPlugin: DomainPlugin<NetworkingClusterState, NetworkSimEvent> = {
  metadata: {
    id: 'networking',
    name: 'Networking Fundamentals (TCP Handshake & Congestion Control)',
    version: '1.0.0',
    category: 'NETWORKING',
    description: 'Packet-level simulation of TCP 3-way handshake (SYN -> SYN-ACK -> ACK), sliding window sequence numbering, packet drop retransmissions, and AIMD congestion control.',
    fidelityTag: 'ORACLE_TESTED',
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
