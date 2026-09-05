'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';

import type { DomainKey } from '../../app/domain-options';

export interface CommandPaletteItem {
  id: string;
  title: string;
  category: 'DOMAINS' | 'SCENARIOS' | 'CONCEPTS' | 'CONTROLS';
  badge?: string | undefined;
  description: string;
  icon: string;
  action: () => void;
  keywords?: string[] | undefined;
}

export interface CommandPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectDomain: (domain: DomainKey) => void;
  onRunScenario?: ((scenarioId: string, domain?: DomainKey) => void) | undefined;
  onTogglePause?: (() => void) | undefined;
  onReset?: (() => void) | undefined;
  onOpenInterviewPrep?: (() => void) | undefined;
  onOpenCompositePipelines?: (() => void) | undefined;
  onSharePermalink?: (() => void) | undefined;
  onOpenTour?: (() => void) | undefined;
}

export function CommandPaletteModal({
  isOpen,
  onClose,
  onSelectDomain,
  onRunScenario,
  onTogglePause,
  onReset,
  onOpenInterviewPrep,
  onOpenCompositePipelines,
  onSharePermalink,
  onOpenTour,
}: CommandPaletteModalProps): React.JSX.Element | null {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Focus search input when modal opens
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const allItems: CommandPaletteItem[] = useMemo(() => {
    const items: CommandPaletteItem[] = [
      // ── Domains (18) ──
      {
        id: 'domain-kafka',
        title: 'Apache Kafka',
        category: 'DOMAINS',
        icon: '⚡',
        badge: 'Streaming',
        description: 'Log partitioning, KRaft consensus, consumer group rebalance, transactional messaging.',
        keywords: ['kafka', 'streaming', 'kraft', 'partition', 'consumer', 'broker'],
        action: () => {
          onSelectDomain('kafka');
          onClose();
        },
      },
      {
        id: 'domain-raft',
        title: 'Raft Consensus',
        category: 'DOMAINS',
        icon: '🛡️',
        badge: 'Consensus',
        description: 'Leader election, quorum log replication, PreVote extension, term synchronization.',
        keywords: ['raft', 'consensus', 'leader', 'election', 'quorum', 'prevote', 'heartbeat'],
        action: () => {
          onSelectDomain('raft');
          onClose();
        },
      },
      {
        id: 'domain-database',
        title: 'Distributed Database',
        category: 'DOMAINS',
        icon: '🗄️',
        badge: 'NoSQL',
        description: 'Consistent hashing, Dynamo model, virtual nodes (vnodes), hinted handoffs.',
        keywords: ['database', 'dynamo', 'cassandra', 'consistent hashing', 'vnode', 'ring'],
        action: () => {
          onSelectDomain('database');
          onClose();
        },
      },
      {
        id: 'domain-redis',
        title: 'Redis Cluster',
        category: 'DOMAINS',
        icon: '⚡',
        badge: 'In-Memory',
        description: 'CRC16 hash slots (0-16383), gossip cluster bus, 8 maxmemory eviction policies.',
        keywords: ['redis', 'crc16', 'slots', 'lru', 'lfu', 'eviction', 'cluster bus'],
        action: () => {
          onSelectDomain('redis');
          onClose();
        },
      },
      {
        id: 'domain-kubernetes',
        title: 'Kubernetes Control Plane',
        category: 'DOMAINS',
        icon: '☸️',
        badge: 'Orchestration',
        description: 'Kube-scheduler node affinity, pod QoS tiers, PDB disruption budgets, reconciliation.',
        keywords: ['kubernetes', 'k8s', 'scheduler', 'pod', 'qos', 'pdb', 'reconciliation'],
        action: () => {
          onSelectDomain('kubernetes');
          onClose();
        },
      },
      {
        id: 'domain-rabbitmq',
        title: 'RabbitMQ Message Broker',
        category: 'DOMAINS',
        icon: '🐇',
        badge: 'AMQP',
        description: 'AMQP 0-9-1 exchanges, Dead Letter Queues, basic.qos prefetch, Raft quorum queues.',
        keywords: ['rabbitmq', 'amqp', 'dlq', 'dead letter', 'quorum queue', 'exchange'],
        action: () => {
          onSelectDomain('rabbitmq');
          onClose();
        },
      },
      {
        id: 'domain-storage',
        title: 'Storage Engine (B+Tree vs LSM)',
        category: 'DOMAINS',
        icon: '💾',
        badge: 'Storage',
        description: 'B+Tree page splits, LSM memtable flush, leveled compaction, Bloom filter FP rate.',
        keywords: ['storage', 'btree', 'lsm', 'rocksdb', 'sqlite', 'bloom filter', 'compaction'],
        action: () => {
          onSelectDomain('storage');
          onClose();
        },
      },
      {
        id: 'domain-networking',
        title: 'TCP Networking & Congestion',
        category: 'DOMAINS',
        icon: '🌐',
        badge: 'Networking',
        description: '3-way handshake, CUBIC vs Reno AIMD, SACK options, sliding receive window.',
        keywords: ['tcp', 'networking', 'cubic', 'reno', 'aimd', 'sack', 'handshake', 'cwnd'],
        action: () => {
          onSelectDomain('networking');
          onClose();
        },
      },
      {
        id: 'domain-rate-limiter',
        title: 'Rate Limiter',
        category: 'DOMAINS',
        icon: '⏱️',
        badge: 'System Design',
        description: 'Token Bucket, Leaky Bucket, Fixed Window, Sliding Log, Cloudflare Sliding Counter.',
        keywords: ['rate limiter', 'token bucket', 'leaky bucket', 'sliding log', 'fixed window'],
        action: () => {
          onSelectDomain('rate-limiter');
          onClose();
        },
      },
      {
        id: 'domain-distributed-lock',
        title: 'Distributed Lock Manager',
        category: 'DOMAINS',
        icon: '🔒',
        badge: 'System Design',
        description: 'Redlock multi-master quorum, Raft lease authority, Martin Kleppmann GC pause fencing.',
        keywords: ['lock', 'redlock', 'fencing', 'kleppmann', 'lease', 'mutex'],
        action: () => {
          onSelectDomain('distributed-lock');
          onClose();
        },
      },
      {
        id: 'domain-cdn-cache',
        title: 'CDN Cache & Edge PoPs',
        category: 'DOMAINS',
        icon: '🌍',
        badge: 'System Design',
        description: 'RFC 9111 HTTP caching, stale-while-revalidate, request coalescing, multi-tier edge.',
        keywords: ['cdn', 'cache', 'pop', 'stale-while-revalidate', 'origin', 'coalescing'],
        action: () => {
          onSelectDomain('cdn-cache');
          onClose();
        },
      },
      {
        id: 'domain-id-gen',
        title: 'Distributed ID Generator',
        category: 'DOMAINS',
        icon: '🔢',
        badge: 'System Design',
        description: 'Twitter Snowflake 64-bit, RFC 9562 UUIDv7 monotonic, clock drift NTP mitigation.',
        keywords: ['snowflake', 'uuidv7', 'id generation', 'clock skew', 'sequence'],
        action: () => {
          onSelectDomain('id-gen');
          onClose();
        },
      },
      {
        id: 'domain-transactions',
        title: 'Distributed Transactions',
        category: 'DOMAINS',
        icon: '🔄',
        badge: 'System Design',
        description: 'Two-Phase Commit (2PC) coordinator crash hazard vs Saga compensating transactions.',
        keywords: ['2pc', 'saga', 'transactions', 'two-phase commit', 'compensation', 'coordinator'],
        action: () => {
          onSelectDomain('transactions');
          onClose();
        },
      },
      {
        id: 'domain-rag',
        title: 'Modular RAG Architecture',
        category: 'DOMAINS',
        icon: '📚',
        badge: 'AI Infrastructure',
        description: 'Dense DPR + Sparse BM25, Reciprocal Rank Fusion (RRF), Lost-in-the-Middle context packing.',
        keywords: ['rag', 'retrieval', 'bm25', 'rrf', 'lost in the middle', 'embeddings'],
        action: () => {
          onSelectDomain('rag');
          onClose();
        },
      },
      {
        id: 'domain-agents',
        title: 'Agent Swarm & Model Context Protocol',
        category: 'DOMAINS',
        icon: '🤖',
        badge: 'AI Infrastructure',
        description: 'MCP JSON-RPC 2.0 message bus, ReAct monologue scratchpad, supervisor-worker graph.',
        keywords: ['agents', 'mcp', 'react', 'tool call', 'swarm', 'orchestration'],
        action: () => {
          onSelectDomain('agents');
          onClose();
        },
      },
      {
        id: 'domain-llm-serving',
        title: 'LLM Serving & PagedAttention',
        category: 'DOMAINS',
        icon: '🧠',
        badge: 'AI Infrastructure',
        description: 'GPU KV-cache block pool (vLLM), Orca continuous batching, Speculative Decoding.',
        keywords: ['llm', 'pagedattention', 'orca', 'batching', 'speculative decoding', 'kv cache'],
        action: () => {
          onSelectDomain('llm-serving');
          onClose();
        },
      },
      {
        id: 'domain-vectordb',
        title: 'Vector Database & ANN Search',
        category: 'DOMAINS',
        icon: '🔍',
        badge: 'AI Infrastructure',
        description: 'Hierarchical Navigable Small World (HNSW), IVF Voronoi clusters, Product Quantization (PQ).',
        keywords: ['vectordb', 'hnsw', 'knn', 'ivf', 'pq', 'ann', 'embeddings'],
        action: () => {
          onSelectDomain('vectordb');
          onClose();
        },
      },
      {
        id: 'domain-gpu-cluster',
        title: 'GPU Cluster & 3D Parallelism',
        category: 'DOMAINS',
        icon: '🖥️',
        badge: 'AI Infrastructure',
        description: 'Megatron-LM TP×PP×DP, ZeRO-1/2/3 memory sharding, 1F1B schedule Gantt, Ring-AllReduce.',
        keywords: ['gpu', 'zero', '1f1b', 'ring-allreduce', 'megatron', 'parallelism', 'nvlink'],
        action: () => {
          onSelectDomain('gpu-cluster');
          onClose();
        },
      },

      // ── Scenarios & Chaos Drills ──
      {
        id: 'scen-burst',
        title: 'Trigger Fixed-Window Boundary Burst (2x Limit Exploit)',
        category: 'SCENARIOS',
        icon: '🚨',
        badge: 'Rate Limiter',
        description: 'Fires back-to-back traffic across window boundary to demonstrate double-capacity vulnerability.',
        keywords: ['boundary burst', 'rate limiter', 'exploit', 'fixed window', 'traffic'],
        action: () => {
          onSelectDomain('rate-limiter');
          onRunScenario?.('boundary-burst', 'rate-limiter');
          onClose();
        },
      },
      {
        id: 'scen-kleppmann',
        title: 'Martin Kleppmann GC Pause Lock Collision (Unfenced Redlock)',
        category: 'SCENARIOS',
        icon: '💥',
        badge: 'Dist Lock',
        description: 'Simulates client stop-the-world GC pause causing split-brain storage corruption without fencing.',
        keywords: ['kleppmann', 'fencing', 'gc pause', 'split brain', 'corruption', 'redlock'],
        action: () => {
          onSelectDomain('distributed-lock');
          onRunScenario?.('kleppmann-gc-pause', 'distributed-lock');
          onClose();
        },
      },
      {
        id: 'scen-2pc-crash',
        title: '2PC Coordinator Crash after PREPARE (Indefinite Freeze)',
        category: 'SCENARIOS',
        icon: '💀',
        badge: 'Transactions',
        description: 'Kills transaction coordinator after participants vote COMMIT, freezing database locks in UNCERTAIN state.',
        keywords: ['2pc', 'coordinator crash', 'prepare', 'freeze', 'transactions', 'blocked'],
        action: () => {
          onSelectDomain('transactions');
          onRunScenario?.('coordinator-crash', 'transactions');
          onClose();
        },
      },
      {
        id: 'scen-lim-reorder',
        title: 'Lost-in-the-Middle U-Curve Context Reordering',
        category: 'SCENARIOS',
        icon: '📊',
        badge: 'RAG',
        description: 'Arranges most relevant chunks at prompt boundaries to counter LLM middle attention degradation.',
        keywords: ['lost in the middle', 'rag', 'context', 'u-curve', 'attention', 'packing'],
        action: () => {
          onSelectDomain('rag');
          onClose();
        },
      },
      {
        id: 'scen-1f1b-bubble',
        title: '1F1B Pipeline Schedule Bubble Minimization',
        category: 'SCENARIOS',
        icon: '🌊',
        badge: 'GPU Cluster',
        description: 'Balances forward and backward microbatch steps across stages to minimize idle bubble fraction.',
        keywords: ['1f1b', 'pipeline bubble', 'gpu cluster', 'microbatch', 'schedule'],
        action: () => {
          onSelectDomain('gpu-cluster');
          onClose();
        },
      },

      // ── Core Concepts & Glossary ──
      {
        id: 'concept-fencing',
        title: 'Fencing Tokens (Monotonic Counter)',
        category: 'CONCEPTS',
        icon: '📖',
        badge: 'Lock Safety',
        description: 'Every lock acquisition increments a monotonic counter. Storage rejects writes bearing stale tokens.',
        keywords: ['fencing token', 'monotonic', 'kleppmann', 'lock', 'stale write'],
        action: () => {
          onSelectDomain('distributed-lock');
          onClose();
        },
      },
      {
        id: 'concept-paged-att',
        title: 'PagedAttention Virtual Memory',
        category: 'CONCEPTS',
        icon: '📖',
        badge: 'LLM Serving',
        description: 'Eliminates KV cache memory fragmentation by allocating non-contiguous physical pages (SOSP 23).',
        keywords: ['pagedattention', 'kv cache', 'fragmentation', 'vllm', 'pages'],
        action: () => {
          onSelectDomain('llm-serving');
          onClose();
        },
      },
      {
        id: 'concept-rrf',
        title: 'Reciprocal Rank Fusion (RRF)',
        category: 'CONCEPTS',
        icon: '📖',
        badge: 'RAG Search',
        description: 'Combines multiple search result rankings without requiring score normalization: RRF(d) = Σ 1/(k + rank).',
        keywords: ['rrf', 'reciprocal rank fusion', 'hybrid search', 'dense sparse', 'bm25'],
        action: () => {
          onSelectDomain('rag');
          onClose();
        },
      },
      {
        id: 'concept-zero',
        title: 'ZeRO: Zero Redundancy Optimizer',
        category: 'CONCEPTS',
        icon: '📖',
        badge: 'DeepSpeed',
        description: 'ZeRO-1 shards optimizer states (4x), ZeRO-2 shards gradients (8x), ZeRO-3 shards model parameters (Nx).',
        keywords: ['zero', 'optimizer', 'gradients', 'memory sharding', 'deepspeed', 'gpu'],
        action: () => {
          onSelectDomain('gpu-cluster');
          onClose();
        },
      },
      {
        id: 'concept-hnsw',
        title: 'Hierarchical Navigable Small World (HNSW)',
        category: 'CONCEPTS',
        icon: '📖',
        badge: 'Vector Search',
        description: 'Skip-list inspired multi-layer graph providing logarithmic time approximate nearest neighbor search.',
        keywords: ['hnsw', 'ann', 'vector graph', 'small world', 'layers', 'skip list'],
        action: () => {
          onSelectDomain('vectordb');
          onClose();
        },
      },
      {
        id: 'concept-aimd',
        title: 'AIMD & CUBIC Congestion Control',
        category: 'CONCEPTS',
        icon: '📖',
        badge: 'Networking',
        description: 'Additive Increase Multiplicative Decrease: Reno drops by 0.5x, Linux CUBIC drops by 0.7x on packet loss.',
        keywords: ['aimd', 'cubic', 'reno', 'tcp', 'ssthresh', 'congestion window'],
        action: () => {
          onSelectDomain('networking');
          onClose();
        },
      },

      // ── Platform Controls & Navigation ──
      {
        id: 'ctrl-interview-prep',
        title: 'Open System Design Interview-Prep Mode',
        category: 'CONTROLS',
        icon: '🎓',
        badge: 'Study Curriculum',
        description: 'Launch guided interactive practice for 6 canonical interview questions with live simulation verification.',
        keywords: ['interview', 'prep', 'study', 'questions', 'faang', 'system design interview'],
        action: () => {
          onOpenInterviewPrep?.();
          onClose();
        },
      },
      {
        id: 'ctrl-share-link',
        title: 'Copy Shareable Scenario Permalink',
        category: 'CONTROLS',
        icon: '🔗',
        badge: 'Share',
        description: 'Copy encoded simulation snapshot URL to clipboard for sharing or bug reporting.',
        keywords: ['share', 'permalink', 'url', 'copy', 'link'],
        action: () => {
          onSharePermalink?.();
          onClose();
        },
      },
      {
        id: 'ctrl-toggle-pause',
        title: 'Play / Pause Simulation',
        category: 'CONTROLS',
        icon: '⏯️',
        badge: 'Simulation',
        description: 'Freeze or resume active simulation tick progression.',
        keywords: ['pause', 'play', 'resume', 'freeze', 'tick'],
        action: () => {
          onTogglePause?.();
          onClose();
        },
      },
      {
        id: 'ctrl-reset',
        title: 'Reset Simulation to Baseline',
        category: 'CONTROLS',
        icon: '🔄',
        badge: 'Simulation',
        description: 'Restore cluster topology, clear metrics, and reinitialize PRNG state.',
        keywords: ['reset', 'restart', 'clear', 'default', 'reinitialize'],
        action: () => {
          onReset?.();
          onClose();
        },
      },
      {
        id: 'ctrl-tour',
        title: 'Start Onboarding Tour',
        category: 'CONTROLS',
        icon: '🧭',
        badge: 'Help',
        description: 'Walk through key platform capabilities, timeline controls, and chaos injections.',
        keywords: ['tour', 'onboarding', 'walkthrough', 'help', 'tutorial'],
        action: () => {
          onOpenTour?.();
          onClose();
        },
      },
      {
        id: 'control-composite-pipelines',
        title: 'Multi-Domain Composite System Pipelines',
        category: 'CONTROLS',
        badge: 'Pipelines',
        description: 'Open interactive end-to-end multi-domain pipelines (AI Serving, Social Feed, FinTech Saga)',
        icon: '🔀',
        action: () => {
          onClose();
          onOpenCompositePipelines?.();
        },
        keywords: ['pipeline', 'composite', 'multi-domain', 'e2e', 'workflow', 'stage'],
      },
      {
        id: 'pipeline-ai-serving',
        title: 'Pipeline: Enterprise AI Agent & Generation',
        category: 'SCENARIOS',
        badge: 'RAG ➜ VectorDB ➜ LLM ➜ GPU',
        description: 'End-to-end multimodal retrieval, HNSW search, PagedAttention batching, and 1F1B GPU scheduling',
        icon: '🧠',
        action: () => {
          onClose();
          onOpenCompositePipelines?.();
        },
        keywords: ['rag', 'vectordb', 'llm-serving', 'gpu-cluster', 'pipeline', 'pagedattention', 'hnsw'],
      },
      {
        id: 'pipeline-social-feed',
        title: 'Pipeline: High-Throughput Social Timeline Fan-out',
        category: 'SCENARIOS',
        badge: 'Kafka ➜ Redis ➜ Storage',
        description: 'End-to-end stream ingest, consumer group worker fan-out, and LSM MemTable/SSTable flush',
        icon: '⚡',
        action: () => {
          onClose();
          onOpenCompositePipelines?.();
        },
        keywords: ['kafka', 'redis', 'storage', 'timeline', 'fanout', 'lsm', 'sstable'],
      },
      {
        id: 'pipeline-fintech-checkout',
        title: 'Pipeline: Mission-Critical FinTech Payment Saga',
        category: 'SCENARIOS',
        badge: 'Rate Limiter ➜ Dist Lock ➜ Saga',
        description: 'End-to-end Token Bucket quota, CAS fencing token inventory lock, and Saga orchestrated settlement',
        icon: '💳',
        action: () => {
          onClose();
          onOpenCompositePipelines?.();
        },
        keywords: ['rate-limiter', 'distributed-lock', 'transactions', 'saga', 'fencing', 'token-bucket'],
      },
    ];

    return items;
  }, [
    onSelectDomain,
    onRunScenario,
    onTogglePause,
    onReset,
    onOpenInterviewPrep,
    onOpenCompositePipelines,
    onSharePermalink,
    onOpenTour,
    onClose,
  ]);

  // Filter items by query
  const filteredItems = useMemo(() => {
    if (!query.trim()) return allItems;
    const q = query.trim().toLowerCase();
    return allItems.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        (item.badge && item.badge.toLowerCase().includes(q)) ||
        (item.keywords && item.keywords.some((k) => k.toLowerCase().includes(q))),
    );
  }, [allItems, query]);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1 < filteredItems.length ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 >= 0 ? prev - 1 : filteredItems.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = filteredItems[selectedIndex];
      if (item) {
        item.action();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Universal Command Palette"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(2, 6, 23, 0.75)',
        backdropFilter: 'blur(6px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '10vh',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '680px',
          maxWidth: '92vw',
          backgroundColor: '#090d16',
          border: '1px solid #334155',
          borderRadius: '12px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '75vh',
        }}
      >
        {/* Search Input Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '14px 18px',
            borderBottom: '1px solid #1e293b',
            gap: '12px',
            backgroundColor: '#020617',
          }}
        >
          <span style={{ fontSize: '1.2rem', color: '#94a3b8' }}>🔍</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search 18 domains, algorithms, glossary terms, or scenarios... (Press Esc to close)"
            style={{
              flex: 1,
              backgroundColor: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#f8fafc',
              fontSize: '0.95rem',
            }}
          />
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            <span
              style={{
                backgroundColor: '#1e293b',
                color: '#94a3b8',
                padding: '2px 6px',
                borderRadius: '4px',
                fontSize: '0.65rem',
                fontWeight: 600,
              }}
            >
              ESC
            </span>
          </div>
        </div>

        {/* Results List */}
        <div
          ref={listRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '8px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          }}
        >
          {filteredItems.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: '#64748b', fontSize: '0.85rem' }}>
              No matches found for "{query}". Try "raft", "token bucket", "pagedattention", or "interview".
            </div>
          ) : (
            filteredItems.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={item.id}
                  onClick={item.action}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  style={{
                    padding: '10px 14px',
                    borderRadius: '8px',
                    backgroundColor: isSelected ? '#1e293b' : 'transparent',
                    border: isSelected ? '1px solid #3b82f6' : '1px solid transparent',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    transition: 'all 0.1s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: '1.2rem' }}>{item.icon}</span>
                    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.85rem', color: isSelected ? '#ffffff' : '#e2e8f0' }}>
                          {item.title}
                        </span>
                        {item.badge && (
                          <span
                            style={{
                              fontSize: '0.65rem',
                              padding: '1px 6px',
                              borderRadius: '4px',
                              backgroundColor:
                                item.category === 'DOMAINS'
                                  ? '#1e3a8a'
                                  : item.category === 'SCENARIOS'
                                  ? '#701a75'
                                  : item.category === 'CONCEPTS'
                                  ? '#78350f'
                                  : '#064e3b',
                              color:
                                item.category === 'DOMAINS'
                                  ? '#93c5fd'
                                  : item.category === 'SCENARIOS'
                                  ? '#f0abfc'
                                  : item.category === 'CONCEPTS'
                                  ? '#fde68a'
                                  : '#6ee7b7',
                              fontWeight: 600,
                            }}
                          >
                            {item.badge}
                          </span>
                        )}
                      </div>
                      <span
                        style={{
                          fontSize: '0.72rem',
                          color: isSelected ? '#cbd5e1' : '#64748b',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {item.description}
                      </span>
                    </div>
                  </div>
                  {isSelected && (
                    <span style={{ fontSize: '0.7rem', color: '#60a5fa', fontWeight: 600 }}>↵ Select</span>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer Navigation Hints */}
        <div
          style={{
            padding: '8px 16px',
            borderTop: '1px solid #1e293b',
            backgroundColor: '#020617',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '0.7rem',
            color: '#64748b',
          }}
        >
          <div style={{ display: 'flex', gap: '14px' }}>
            <span>
              <kbd style={{ backgroundColor: '#1e293b', padding: '1px 5px', borderRadius: '3px', color: '#cbd5e1' }}>↑↓</kbd> Navigate
            </span>
            <span>
              <kbd style={{ backgroundColor: '#1e293b', padding: '1px 5px', borderRadius: '3px', color: '#cbd5e1' }}>↵</kbd> Execute
            </span>
            <span>
              <kbd style={{ backgroundColor: '#1e293b', padding: '1px 5px', borderRadius: '3px', color: '#cbd5e1' }}>ESC</kbd> Close
            </span>
          </div>
          <span>Showing {filteredItems.length} items across 18 domains</span>
        </div>
      </div>
    </div>
  );
}
