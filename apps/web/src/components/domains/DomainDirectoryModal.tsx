'use client';

import React from 'react';

import type { DomainKey } from '../../app/domain-options';

export interface DomainCardInfo {
  id:
    | 'kafka'
    | 'raft'
    | 'database'
    | 'redis'
    | 'kubernetes'
    | 'rabbitmq'
    | 'storage'
    | 'networking'
    | 'rate-limiter'
    | 'distributed-lock'
    | 'cdn-cache'
    | 'id-gen'
    | 'transactions'
    | 'llm-serving'
    | 'vectordb'
    | 'gpu-cluster'
    | 'llm-pipeline'
    | 'llm-gateway'
    | 'load-balancer'
    | 'search-index'
    | 'task-scheduler'
    | 'chat-presence'
    | 'feature-store'
    | 'model-rollout'
    | 'llm-eval'
    | 'consistent-hashing'
    | 'probabilistic-structures'
    | 'merkle-trees';
  name: string;
  category: string;
  icon: string;
  tagline: string;
  fidelityTag: string;
  fidelityDisplayName?: string;
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
    tagline:
      'Log partitioning, consumer group rebalances, ISR replication, exactly-once transactions.',
    fidelityTag: 'ORACLE_TESTED',
    fidelityDisplayName: 'Kafka-tested',
    oracleSystem: 'apache/kafka:4.3 (Testcontainers Oracle Harness)',
    color: '#6366f1',
    highlights: [
      'Deterministic Discrete-Event Engine',
      'Murmur2 Partitioning',
      'Two-Phase Commit Txn Coordinator',
      'Log Compaction & Segments',
    ],
  },
  {
    id: 'raft',
    name: 'Raft Consensus',
    category: 'CONSENSUS',
    icon: '🛡️',
    tagline:
      'Leader elections, term counters, randomized election timers, quorum log replication, split-brain safety.',
    fidelityTag: 'ORACLE_TESTED',
    fidelityDisplayName: 'Raft-tested',
    oracleSystem: 'etcd-io/raft Reference Oracle',
    color: '#a855f7',
    highlights: [
      'Term Invariant Assertion',
      'Quorum Disjointness Election Safety',
      'Asymmetric Network Partitions',
      'Heartbeat Countdowns',
    ],
  },
  {
    id: 'database',
    name: 'Distributed Database (ScyllaDB / Cassandra)',
    category: 'DATABASE',
    icon: '🗄️',
    tagline:
      'Consistent hashing with vnodes, tunable quorum consistency (R+W>N), hinted handoffs, background read-repair.',
    fidelityTag: 'ORACLE_TESTED',
    fidelityDisplayName: 'Cassandra-tested',
    oracleSystem: 'cassandra:4.1 / scylladb Architecture Model',
    color: '#10b981',
    highlights: [
      '32-Bit FNV-1a Hash Ring',
      'PACELC Eventual vs Strong Quorums',
      'Zero-Downtime Scale-Out Joins',
      'Vector Clock Version Reconciliation',
    ],
  },
  {
    id: 'redis',
    name: 'Redis Cluster',
    category: 'CACHE',
    icon: '⚡',
    tagline:
      '16,384 hash slots with CRC16 hashtags, primary/replica pairs, MOVED/ASK client redirects, and LRU/LFU/TTL eviction.',
    fidelityTag: 'ORACLE_TESTED',
    fidelityDisplayName: 'Redis-tested',
    oracleSystem: 'redis:7.2 Cluster Protocol',
    color: '#ef4444',
    highlights: [
      '16,384 Slot Allocation Bar',
      'CRC16 Hashtag {user:id} Parser',
      'Multi-Policy Eviction Sandbox',
      'Master-to-Replica Failover',
    ],
  },
  {
    id: 'kubernetes',
    name: 'Kubernetes',
    category: 'ORCHESTRATION',
    icon: '☸️',
    tagline:
      'Two-phase pod scheduling (predicates/scoring), CPU/Memory bin-packing, rolling updates, and declarative reconciliation loops.',
    fidelityTag: 'ORACLE_TESTED',
    fidelityDisplayName: 'K8s-tested',
    oracleSystem: 'kind/k8s:v1.30 Control Plane Model',
    color: '#3b82f6',
    highlights: [
      'Two-Phase Scheduler Filter & Score',
      'Why is this Pod Pending? Diagnostics',
      'Zero-Downtime Rolling Updates',
      'Node Cordon & Drain Eviction',
    ],
  },
  {
    id: 'rabbitmq',
    name: 'RabbitMQ',
    category: 'STREAMING',
    icon: '🐇',
    tagline:
      'Direct/Fanout/Topic exchange routing with wildcards (*, #), Dead-Letter Exchanges (DLX), and prefetch QoS.',
    fidelityTag: 'ORACLE_TESTED',
    fidelityDisplayName: 'RabbitMQ-tested',
    oracleSystem: 'rabbitmq:3.13 AMQP 0-9-1 Protocol',
    color: '#f97316',
    highlights: [
      'Topic Pattern Wildcards (*, #)',
      'Dead-Letter Exchange (DLX) Routing',
      'Message Rejection & Poison Pill Isolation',
      'Competing Consumer Prefetch QoS',
    ],
  },
  {
    id: 'storage',
    name: 'Storage Engine Internals',
    category: 'DATABASE',
    icon: '💾',
    tagline:
      'B+ Tree page splits/balancing (SQLite) vs. LSM-Tree MemTable flushes, immutable SSTables, Bloom filters, and Leveled Compaction (RocksDB).',
    fidelityTag: 'ORACLE_TESTED',
    fidelityDisplayName: 'SQLite-tested',
    oracleSystem: 'sqlite3 / rocksdb:v8 Storage Layer Model',
    color: '#14b8a6',
    highlights: [
      'Order-B B+ Tree Page Split & Root Balancing',
      'Append-Only WAL & MemTable Threshold Flush',
      '16-Bit Bloom Filter Key Membership Bitsets',
      'Multi-Level SSTable Merging & Compaction',
    ],
  },
  {
    id: 'networking',
    name: 'Networking Fundamentals',
    category: 'NETWORKING',
    icon: '🌐',
    tagline:
      'Packet-level simulation of TCP 3-way handshake (SYN -> SYN-ACK -> ACK), sliding window sequence numbering, and AIMD congestion control.',
    fidelityTag: 'ORACLE_TESTED',
    fidelityDisplayName: 'RFC-tested',
    oracleSystem: 'RFC 793 / RFC 5681 TCP Protocol Model',
    color: '#06b6d4',
    highlights: [
      '3-Way Handshake Connection Sequence Ladder',
      'Sliding Window Sequence Numbering & Buffering',
      'In-Flight Packet Drop Simulation',
      'Slow Start & Congestion Avoidance AIMD Curve',
    ],
  },
  {
    id: 'rate-limiter',
    name: 'Rate Limiter',
    category: 'GATEWAY',
    icon: '⏱️',
    tagline:
      'Token Bucket, Leaky Bucket, Fixed Window boundary bursts, Sliding Window Log, and Cloudflare Sliding Counter approximation.',
    fidelityTag: 'PROTOCOL_COMPATIBLE',
    fidelityDisplayName: 'RFC/Cloudflare',
    oracleSystem: 'RFC 2697 / Cloudflare Rate Limiting Spec',
    color: '#f59e0b',
    highlights: [
      '5-Algorithm Side-by-Side Comparison',
      'RFC 2697 Token Bucket Fill/Drain',
      'RL-3 Fixed Window Boundary Burst Spotlight',
      'Cloudflare Weighted Average Approximation',
    ],
  },
  {
    id: 'distributed-lock',
    name: 'Distributed Lock Manager',
    category: 'CONSENSUS',
    icon: '🔒',
    tagline:
      'Redlock multi-node quorum vs Raft leases, demonstrating Kleppmann GC-pause hazards and downstream fencing token enforcement.',
    fidelityTag: 'PROTOCOL_COMPATIBLE',
    fidelityDisplayName: 'Redlock/Kleppmann',
    oracleSystem: 'Redis Redlock Spec / Kleppmann Analysis',
    color: '#ef4444',
    highlights: [
      'N-Node Redlock Majority Quorum',
      'Martin Kleppmann GC Pause Race Condition',
      'Monotonic Fencing Token Ledger',
      'Downstream Stale-Write Protection',
    ],
  },
  {
    id: 'cdn-cache',
    name: 'CDN & Multi-Tier Caching',
    category: 'CACHE',
    icon: '⚡',
    tagline:
      'Edge-to-Origin tiered caching with RFC 9111 HTTP semantics (max-age, stale-while-revalidate, ETag), coalescing, and purge waves.',
    fidelityTag: 'PROTOCOL_COMPATIBLE',
    fidelityDisplayName: 'RFC 9111',
    oracleSystem: 'RFC 9111 / RFC 5861 HTTP Caching Spec',
    color: '#3b82f6',
    highlights: [
      'Multi-Tier Edge -> Regional -> Origin Waterfall',
      'RFC 5861 Stale-While-Revalidate Window',
      'Single-Flight Request Coalescing (CDN-2)',
      'Fleet-Wide Purge Wave Propagation',
    ],
  },
  {
    id: 'id-gen',
    name: 'Distributed ID Generation',
    category: 'DATABASE',
    icon: '🆔',
    tagline:
      '64-bit Twitter Snowflake ID generation with bit-field decomposition, RFC 9562 UUIDv7 sortability, and NTP backward skew guards.',
    fidelityTag: 'PROTOCOL_COMPATIBLE',
    fidelityDisplayName: 'Snowflake/RFC 9562',
    oracleSystem: 'Twitter Snowflake / RFC 9562 UUIDv7',
    color: '#8b5cf6',
    highlights: [
      '64-Bit Interactive Bit-Field Decomposition',
      'NTP Clock Regression Safety Refusal (ID-3)',
      '12-Bit Sequence Rollover (>4096 IDs/ms)',
      'UUIDv4 Random vs UUIDv7 Monotonic Comparison',
    ],
  },
  {
    id: 'transactions',
    name: 'Distributed Transactions (2PC & Saga)',
    category: 'CONSENSUS',
    icon: '💳',
    tagline:
      'Two-Phase Commit (2PC) with coordinator-crash blocking hazard demonstration vs Saga forward orchestration and reverse LIFO compensation.',
    fidelityTag: 'PROTOCOL_COMPATIBLE',
    fidelityDisplayName: 'Gray 1978 / Sagas',
    oracleSystem: 'Gray (1978) 2PC / Garcia-Molina (1987) Sagas',
    color: '#10b981',
    highlights: [
      '2PC Coordinator/Participant Swimlane',
      'TXN-2 Coordinator Crash Blocking Hazard',
      'Saga Checkout Forward Orchestration',
      'Strict Reverse LIFO Compensating Actions',
    ],
  },

  {
    id: 'llm-serving',
    name: 'LLM Inference Serving (PagedAttention)',
    category: 'AI_INFRA',
    icon: '⚡',
    tagline:
      'vLLM PagedAttention GPU KV-cache virtual memory allocator, Orca continuous batching prefill/decode scheduling, and Speculative Decoding verifier.',
    fidelityTag: 'PROTOCOL_COMPATIBLE',
    fidelityDisplayName: 'vLLM / Orca SOSP \'23',
    oracleSystem: 'vLLM SOSP \'23 / Orca OSDI \'22 / Speculative Decoding',
    color: '#10b981',
    highlights: [
      'Physical GPU KV-Cache Paging Grid',
      'Continuous Batching Prefill/Decode Waterfall',
      'Speculative Lookahead Verification Ribbon',
      'LLM-2 Memory Ceiling & OOM Eviction Guard',
    ],
  },
  {
    id: 'vectordb',
    name: 'Vector Database (HNSW & IVF-PQ)',
    category: 'AI_INFRA',
    icon: '🧭',
    tagline:
      'Multi-layer Hierarchical Navigable Small World (HNSW) graph routing, Inverted File Product Quantization (IVF-PQ) Voronoi cell space partitioning, and recall gauges.',
    fidelityTag: 'PROTOCOL_COMPATIBLE',
    fidelityDisplayName: 'HNSW / IVF-PQ',
    oracleSystem: 'Malkov (2018) HNSW / Jégou (2011) Product Quantization',
    color: '#f59e0b',
    highlights: [
      'Multi-Layer HNSW Skip-Highway Graph Descent',
      'Voronoi Cell Space Partitioning',
      '8-Bit Product Quantization Codebook',
      'Dynamic Recall@K vs Distance Computations Gauge',
    ],
  },
  {
    id: 'gpu-cluster',
    name: 'GPU Cluster & 3D Parallelism',
    category: 'AI_INFRA',
    icon: '🖥️',
    tagline:
      'Megatron-LM 3D Parallelism (TP x PP x DP), DeepSpeed ZeRO-1/2/3 memory sharding, 1F1B pipeline microbatch schedule Gantt waterfall, and Ring-AllReduce gradient sync.',
    fidelityTag: 'PROTOCOL_COMPATIBLE',
    fidelityDisplayName: 'Megatron-LM / ZeRO',
    oracleSystem: 'Shoeybi (2019) Megatron-LM / Rajbhandari (2020) ZeRO',
    color: '#ec4899',
    highlights: [
      'NVLink 900 GB/s vs InfiniBand 400G Mesh Topography',
      '1F1B Pipeline Schedule Waterfall Gantt Chart',
      'Circular Ring-AllReduce Tensor Transfers',
      'ZeRO-1/2/3 VRAM Memory Scaling Profile',
    ],
  },
  {
    id: 'llm-pipeline',
    name: 'LLM Pipeline & Lineage (PIPE-8)',
    category: 'AI_INFRA',
    icon: '🧬',
    tagline:
      'ETL document ingestion, dense + BM25 hybrid search with RRF fusion, agentic tool DAG execution, and W3C PROV end-to-end lineage traceability.',
    fidelityTag: 'PROTOCOL_COMPATIBLE',
    fidelityDisplayName: 'OpenLineage / W3C PROV',
    oracleSystem: 'W3C PROV-DM / OpenLineage 1.0 Specification',
    color: '#06b6d4',
    highlights: [
      'Flagship PIPE-8 Provenance Lineage Traceability',
      'Interactive Provenance Graph Walk-Back Ribbon',
      'Dense DPR + Sparse BM25 RRF Rank Combination',
      'Acyclic Agent Tool Execution DAG',
    ],
  },
  {
    id: 'llm-gateway',
    name: 'LLM Gateway & Guardrails (GW-1)',
    category: 'AI_INFRA',
    icon: '🛡️',
    tagline:
      'Multi-provider fallback routing with Martin Fowler circuit breakers (CLOSED/OPEN/HALF_OPEN), cosine semantic caching, and pre-execution adversarial injection guardrails.',
    fidelityTag: 'PROTOCOL_COMPATIBLE',
    fidelityDisplayName: 'Martin Fowler FSM / Cosine Cache',
    oracleSystem: 'Martin Fowler Circuit Breaker / GPTCache / NeMo Guardrails',
    color: '#3b82f6',
    highlights: [
      'Flagship GW-1 Circuit Breaker FSM Rigor & Fallback Routing',
      'Interactive Polar Cosine Similarity Radar',
      'Zero-Cost Semantic Cache with Acceptance Radius',
      'Pre-Execution Adversarial Injection Scanner',
    ],
  },
  {
    id: 'load-balancer',
    name: 'Load Balancer (LB-1..LB-4)',
    category: 'SYSTEM_DESIGN',
    icon: '⚖️',
    tagline:
      'Round robin, smooth weighted round robin (nginx), least connections, least response time (EWMA), and consistent-hash sticky sessions with health-check failover and graceful drain.',
    fidelityTag: 'PROTOCOL_COMPATIBLE',
    fidelityDisplayName: 'HAProxy / nginx / ALB',
    oracleSystem: 'HAProxy balance algorithms / nginx upstream / AWS ALB',
    color: '#3b82f6',
    highlights: [
      'Live Routing-Decision Reasoning Line (flagship)',
      'Weighted Distribution Accuracy (LB-2, chi-square)',
      'Health-Check Failover with Sticky Reassignment (LB-3)',
      'Rolling Deploy with Zero Downtime (LB-4)',
    ],
  },
  {
    id: 'search-index',
    name: 'Distributed Search & Inverted Index (BM25)',
    category: 'SYSTEM_DESIGN',
    icon: '🔍',
    tagline:
      'Analyzer pipeline, inverted index posting lists, real Robertson-Zaragoza/Lucene BM25 with per-term arithmetic, shard replicas, and scatter-gather fan-out.',
    fidelityTag: 'PROTOCOL_COMPATIBLE',
    fidelityDisplayName: 'Elasticsearch / Lucene BM25',
    oracleSystem: 'Lucene BM25Similarity / Elasticsearch query_then_fetch',
    color: '#f59e0b',
    highlights: [
      'Flagship BM25 Score Breakdown (tf, idf, length normalization)',
      'Live Inverted Index Table on Ingest',
      'Posting-List Cleanup on Delete (SEARCH-1)',
      'Scatter-Gather with Replica Failover (SEARCH-3)',
    ],
  },
  {
    id: 'task-scheduler',
    name: 'Distributed Task Scheduler & Cron',
    category: 'SYSTEM_DESIGN',
    icon: '⏰',
    tagline:
      'Leader-elected dispatcher with lease (SCHED-1), exactly-once idempotency-key dispatch (SCHED-2), DAG ordering with upstream skips (SCHED-3), backoff with jitter (SCHED-4).',
    fidelityTag: 'PROTOCOL_COMPATIBLE',
    fidelityDisplayName: 'Chronos / Airflow',
    oracleSystem: 'Apache Airflow scheduler / Chronos / Brooker 2015 jitter',
    color: '#10b981',
    highlights: [
      'DAG Execution Graph with Live Task Status',
      'Split-Brain Dispatch Rejection (SCHED-1)',
      'Exactly-Once Dispatch Across Leader Failover (SCHED-2)',
      'Retry Timeline with Jitter Scatter (SCHED-4)',
    ],
  },
  {
    id: 'chat-presence',
    name: 'Real-Time Chat & Presence',
    category: 'SYSTEM_DESIGN',
    icon: '💬',
    tagline:
      'Sequence-number ordering with client reordering and dedup (at-least-once), presence staleness bounds, group fanout with offline queuing, TTL typing indicators.',
    fidelityTag: 'PROTOCOL_COMPATIBLE',
    fidelityDisplayName: 'RFC 6455 / DDIA ch. 8',
    oracleSystem: 'RFC 6455 WebSocket / Kleppmann delivery semantics',
    color: '#06b6d4',
    highlights: [
      'Per-Recipient Delivery Status Ticks',
      'Out-of-Order Delivery Reordering (CHAT-1)',
      'Presence ONLINE→AWAY→OFFLINE Bounds (CHAT-2)',
      'Redelivery Dedup (CHAT-4)',
    ],
  },
  {
    id: 'feature-store',
    name: 'ML Feature Store (FS-1..FS-4)',
    category: 'AI_INFRA',
    icon: '🗄️',
    tagline:
      'Point-in-time-correct training-set joins (no label leakage), online/offline consistency at the sync watermark, staleness TTL flags, versioned definitions.',
    fidelityTag: 'PROTOCOL_COMPATIBLE',
    fidelityDisplayName: 'Feast / Tecton / Michelangelo',
    oracleSystem: 'Feast point-in-time joins / Uber Michelangelo',
    color: '#8b5cf6',
    highlights: [
      'Flagship Draggable As-Of Timeline (PIT join live)',
      'Leak Detection on Training Rows (FS-1)',
      'Sync-Lag Window Visualization (FS-2)',
      'Staleness Flag Enforcement (FS-3)',
    ],
  },
  {
    id: 'model-rollout',
    name: 'Model Deployment & Canary Rollout',
    category: 'AI_INFRA',
    icon: '🚀',
    tagline:
      'Shadow traffic with zero client impact (ROLL-1), percentage canary (ROLL-2), automatic threshold rollback (ROLL-3), z-test significance gate (ROLL-4), eval-gate blocking (ROLL-5).',
    fidelityTag: 'PROTOCOL_COMPATIBLE',
    fidelityDisplayName: 'Argo Rollouts / Flagger',
    oracleSystem: 'Argo Rollouts / Flagger / Kohavi 2020 experiments',
    color: '#ec4899',
    highlights: [
      'Traffic-Split Lanes with Visually Separated Shadow',
      'Automatic Rollback Snap-Back Animation (ROLL-3)',
      'Small-Sample Promotion Blocked Pending Significance (ROLL-4)',
      'Eval Gate Blocking a Real Promotion Attempt (ROLL-5)',
    ],
  },
  {
    id: 'llm-eval',
    name: 'LLM Evaluation & Guardrails Pipeline',
    category: 'AI_INFRA',
    icon: '🧪',
    tagline:
      'Offline eval suite with deterministic scripted model profiles, red-team regression detection across versions, version-pinned policy re-scoring, deployment gate.',
    fidelityTag: 'PROTOCOL_COMPATIBLE',
    fidelityDisplayName: 'HELM / OpenAI Evals / NeMo',
    oracleSystem: 'HELM (Liang 2022) / Perez 2022 red-teaming / OpenAI Evals',
    color: '#ef4444',
    highlights: [
      'Flagship Red-Team Regression Grid (newly-red cell)',
      'Full Suite Coverage Enforcement (EVAL-1)',
      'Policy Version-Pinned Rescoring (EVAL-3)',
      'Deployment Gate Blocking (EVAL-4 → /model-rollout)',
    ],
  },
  {
    id: 'consistent-hashing',
    name: 'Consistent Hashing Deep-Dive',
    category: 'ALGORITHMS',
    icon: '🌀',
    tagline:
      'Ring with virtual nodes (Karger 1997), Jump Consistent Hash (Lamping & Veach 2014, growth-only), and Rendezvous/HRW — compared live against naive hash % N.',
    fidelityTag: 'PROTOCOL_COMPATIBLE',
    fidelityDisplayName: 'Karger STOC \'97 / Lamping-Veach / HRW',
    oracleSystem: 'Karger et al. STOC 1997 / arXiv:1406.2294 / Thaler-Ravishankar 1996',
    color: '#f59e0b',
    highlights: [
      'Flagship Ring Visualization with Colored Vnode Ticks',
      '3-Algorithm Key-Movement Counter on Identical Events (CHASH-1)',
      'Virtual-Node Load Balance Slider (CHASH-2)',
      'Instrumented Lookup Complexity (O(log vN) vs O(N))',
    ],
  },
  {
    id: 'probabilistic-structures',
    name: 'Bloom Filters & Probabilistic Structures',
    category: 'ALGORITHMS',
    icon: '🎲',
    tagline:
      'Standard Bloom, Counting Bloom, Cuckoo (full rollback kick chains), HyperLogLog (1.04/√m), and Count-Min Sketch fed one identical stream.',
    fidelityTag: 'PROTOCOL_COMPATIBLE',
    fidelityDisplayName: 'Bloom / Fan / Flajolet / Cormode',
    oracleSystem: 'Bloom 1970 / Fan 2000 / Fan CoNEXT 2014 / Flajolet 2007 / Cormode 2005',
    color: '#10b981',
    highlights: [
      'Flagship 5-Structure Comparison Table (memory vs accuracy)',
      'Live Bit Array and HLL Register Visuals',
      'Counting-Bloom Deletion Safety on Colliding Neighbors (PROB-2)',
      'CMS One-Sided Error on Adversarial Collisions (PROB-4)',
    ],
  },
  {
    id: 'merkle-trees',
    name: 'Merkle Trees & Distributed Verification',
    category: 'ALGORITHMS',
    icon: '🌳',
    tagline:
      'Bottom-up tree-hash construction, sibling-path proofs (verify and tamper), instrumented anti-entropy divergence localization, Merkle-Patricia membership AND non-membership proofs.',
    fidelityTag: 'PROTOCOL_COMPATIBLE',
    fidelityDisplayName: 'Merkle 1979 / Dynamo / Ethereum MPT',
    oracleSystem: 'Merkle 1979/1987 / Dynamo SOSP 2007 / Ethereum MPT / Git',
    color: '#06b6d4',
    highlights: [
      'Flagship Bottom-Up Tree-Hash Construction',
      'Single-Bit Flip Root Sensitivity (MERKLE-1)',
      'Anti-Entropy Walk vs Full-Scan Comparison Counter (MERKLE-3)',
      'Patricia Non-Membership Proof + Forgery Rejection (MERKLE-4)',
    ],
  },
];

interface DomainDirectoryModalProps {
  isOpen: boolean;
  activeDomain: DomainKey;
  onSelectDomain: (id: DomainKey) => void;
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
              Explore real-time deterministic interactive visualizers across 5 core distributed
              systems domains.
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
                <div
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '1.3rem' }}>{dom.icon}</span>
                    <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#f8fafc' }}>
                      {dom.name}
                    </span>
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

                <p
                  style={{
                    margin: 0,
                    fontSize: '0.72rem',
                    color: '#cbd5e1',
                    lineHeight: '1.3',
                    flex: 1,
                  }}
                >
                  {dom.tagline}
                </p>

                {/* Highlights */}
                <div
                  style={{ display: 'flex', flexDirection: 'column', gap: '2px', margin: '4px 0' }}
                >
                  {dom.highlights.map((h, i) => (
                    <div
                      key={i}
                      style={{
                        fontSize: '0.65rem',
                        color: '#94a3b8',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
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
                  <span>Oracle: {dom.fidelityDisplayName || dom.fidelityTag}</span>
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
