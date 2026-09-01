'use client';

import React from 'react';

export interface DomainCardInfo {
  id: 'kafka' | 'raft' | 'database' | 'redis' | 'kubernetes' | 'rabbitmq' | 'storage' | 'networking';
  name: string;
  category: string;
  icon: string;
  tagline: string;
  fidelityTag: string;
  oracleSystem: string;
  color: string;
  highlights: string[];
}

export const DOMAIN_CATALOG: DomainCardInfo[] = [
  {
    id: 'kafka',
    name: 'Apache Kafka',
    category: 'STREAMING',
    icon: '⚡',
    tagline: 'Log partitioning, consumer group rebalances, ISR replication, exactly-once transactions.',
    fidelityTag: 'ORACLE_TESTED',
    oracleSystem: 'apache/kafka:4.3 (Testcontainers Oracle Harness)',
    color: '#6366f1',
    highlights: ['Deterministic Discrete-Event Engine', 'Murmur2 Partitioning', 'Two-Phase Commit Txn Coordinator', 'Log Compaction & Segments'],
  },
  {
    id: 'raft',
    name: 'Raft Consensus',
    category: 'CONSENSUS',
    icon: '🛡️',
    tagline: 'Leader elections, term counters, randomized election timers, quorum log replication, split-brain safety.',
    fidelityTag: 'ORACLE_TESTED',
    oracleSystem: 'etcd-io/raft Reference Oracle',
    color: '#a855f7',
    highlights: ['Term Invariant Assertion', 'Quorum Disjointness Election Safety', 'Asymmetric Network Partitions', 'Heartbeat Countdowns'],
  },
  {
    id: 'database',
    name: 'Distributed Database (ScyllaDB / Cassandra)',
    category: 'DATABASE',
    icon: '🗄️',
    tagline: 'Consistent hashing with vnodes, tunable quorum consistency (R+W>N), hinted handoffs, background read-repair.',
    fidelityTag: 'ORACLE_TESTED',
    oracleSystem: 'cassandra:4.1 / scylladb Architecture Model',
    color: '#10b981',
    highlights: ['32-Bit FNV-1a Hash Ring', 'PACELC Eventual vs Strong Quorums', 'Zero-Downtime Scale-Out Joins', 'Vector Clock Version Reconciliation'],
  },
  {
    id: 'redis',
    name: 'Redis Cluster',
    category: 'CACHE',
    icon: '⚡',
    tagline: '16,384 hash slots with CRC16 hashtags, primary/replica pairs, MOVED/ASK client redirects, and LRU/LFU/TTL eviction.',
    fidelityTag: 'ORACLE_TESTED',
    oracleSystem: 'redis:7.2 Cluster Protocol',
    color: '#ef4444',
    highlights: ['16,384 Slot Allocation Bar', 'CRC16 Hashtag {user:id} Parser', 'Multi-Policy Eviction Sandbox', 'Master-to-Replica Failover'],
  },
  {
    id: 'kubernetes',
    name: 'Kubernetes',
    category: 'ORCHESTRATION',
    icon: '☸️',
    tagline: 'Two-phase pod scheduling (predicates/scoring), CPU/Memory bin-packing, rolling updates, and declarative reconciliation loops.',
    fidelityTag: 'ORACLE_TESTED',
    oracleSystem: 'kind/k8s:v1.30 Control Plane Model',
    color: '#3b82f6',
    highlights: ['Two-Phase Scheduler Filter & Score', 'Why is this Pod Pending? Diagnostics', 'Zero-Downtime Rolling Updates', 'Node Cordon & Drain Eviction'],
  },
  {
    id: 'rabbitmq',
    name: 'RabbitMQ',
    category: 'STREAMING',
    icon: '🐇',
    tagline: 'Direct/Fanout/Topic exchange routing with wildcards (*, #), Dead-Letter Exchanges (DLX), and prefetch QoS.',
    fidelityTag: 'ORACLE_TESTED',
    oracleSystem: 'rabbitmq:3.13 AMQP 0-9-1 Protocol',
    color: '#f97316',
    highlights: ['Topic Pattern Wildcards (*, #)', 'Dead-Letter Exchange (DLX) Routing', 'Message Rejection & Poison Pill Isolation', 'Competing Consumer Prefetch QoS'],
  },
  {
    id: 'storage',
    name: 'Storage Engine Internals',
    category: 'DATABASE',
    icon: '💾',
    tagline: 'B+ Tree page splits/balancing (SQLite) vs. LSM-Tree MemTable flushes, immutable SSTables, Bloom filters, and Leveled Compaction (RocksDB).',
    fidelityTag: 'ORACLE_TESTED',
    oracleSystem: 'sqlite3 / rocksdb:v8 Storage Layer Model',
    color: '#14b8a6',
    highlights: ['Order-B B+ Tree Page Split & Root Balancing', 'Append-Only WAL & MemTable Threshold Flush', '16-Bit Bloom Filter Key Membership Bitsets', 'Multi-Level SSTable Merging & Compaction'],
  },
  {
    id: 'networking',
    name: 'Networking Fundamentals',
    category: 'NETWORKING',
    icon: '🌐',
    tagline: 'Packet-level simulation of TCP 3-way handshake (SYN -> SYN-ACK -> ACK), sliding window sequence numbering, and AIMD congestion control.',
    fidelityTag: 'ORACLE_TESTED',
    oracleSystem: 'RFC 793 / RFC 5681 TCP Protocol Model',
    color: '#06b6d4',
    highlights: ['3-Way Handshake Connection Sequence Ladder', 'Sliding Window Sequence Numbering & Buffering', 'In-Flight Packet Drop Simulation', 'Slow Start & Congestion Avoidance AIMD Curve'],
  },
];

interface DomainDirectoryModalProps {
  isOpen: boolean;
  activeDomain: 'kafka' | 'raft' | 'database' | 'redis' | 'kubernetes' | 'rabbitmq' | 'storage' | 'networking';
  onSelectDomain: (id: 'kafka' | 'raft' | 'database' | 'redis' | 'kubernetes' | 'rabbitmq' | 'storage' | 'networking') => void;
  onClose: () => void;
}

export function DomainDirectoryModal({
  isOpen,
  activeDomain,
  onSelectDomain,
  onClose,
}: DomainDirectoryModalProps): React.JSX.Element | null {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(2, 6, 23, 0.85)',
        backdropFilter: 'blur(8px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#0f172a',
          border: '1px solid #334155',
          borderRadius: '12px',
          width: '100%',
          maxWidth: '900px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #1e293b',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#f8fafc' }}>
              🌐 Distributed Systems Simulator Catalog
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: '#94a3b8' }}>
              Explore real-time deterministic interactive visualizers across 5 core distributed systems domains.
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              backgroundColor: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: '1.2rem',
              cursor: 'pointer',
              padding: '4px 8px',
            }}
          >
            ✕
          </button>
        </div>

        {/* Catalog Grid */}
        <div
          style={{
            padding: '20px',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: '16px',
            overflowY: 'auto',
          }}
        >
          {DOMAIN_CATALOG.map((dom) => {
            const isActive = activeDomain === dom.id;
            return (
              <div
                key={dom.id}
                onClick={() => {
                  onSelectDomain(dom.id);
                  onClose();
                }}
                style={{
                  backgroundColor: isActive ? 'rgba(99, 102, 241, 0.1)' : '#020617',
                  border: isActive ? `2px solid ${dom.color}` : '1px solid #1e293b',
                  borderRadius: '8px',
                  padding: '16px',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  transition: 'all 0.15s ease',
                }}
              >
                {/* Domain Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '1.3rem' }}>{dom.icon}</span>
                    <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#f8fafc' }}>{dom.name}</span>
                  </div>
                  <span
                    style={{
                      fontSize: '0.6rem',
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: '4px',
                      backgroundColor: `${dom.color}20`,
                      color: dom.color,
                      letterSpacing: '0.5px',
                    }}
                  >
                    {dom.category}
                  </span>
                </div>

                <p style={{ margin: 0, fontSize: '0.72rem', color: '#cbd5e1', lineHeight: '1.3', flex: 1 }}>
                  {dom.tagline}
                </p>

                {/* Highlights */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', margin: '4px 0' }}>
                  {dom.highlights.map((h, i) => (
                    <div key={i} style={{ fontSize: '0.65rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ color: dom.color }}>✓</span> {h}
                    </div>
                  ))}
                </div>

                {/* Fidelity Badge */}
                <div
                  style={{
                    fontSize: '0.62rem',
                    color: '#64748b',
                    borderTop: '1px solid #1e293b',
                    paddingTop: '6px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span>Oracle: {dom.fidelityTag}</span>
                  <button
                    className="btn"
                    style={{
                      backgroundColor: dom.color,
                      color: '#ffffff',
                      fontSize: '0.65rem',
                      padding: '3px 8px',
                      fontWeight: 600,
                    }}
                  >
                    Launch →
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
