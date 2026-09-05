import type { DomainKey } from '../../app/domain-options';

export interface PipelineStage {
  id: string;
  name: string;
  domain: DomainKey;
  icon: string;
  description: string;
  latencyBudgetMs: number;
  inputPayload: string;
  outputPayload: string;
  actionSummary: string;
  scenarioId?: string;
}

export interface CompositePipeline {
  id: string;
  title: string;
  subtitle: string;
  badge: string;
  color: string;
  description: string;
  targetSla: string;
  stages: PipelineStage[];
}

export const COMPOSITE_PIPELINES: CompositePipeline[] = [
  {
    id: 'ai-serving-pipeline',
    title: 'Enterprise AI Agent & Generation Pipeline',
    subtitle: 'From Multimodal Query to Distributed GPU Tensor Parallelism',
    badge: 'AI Infrastructure',
    color: '#38bdf8',
    description:
      'Traces a complex user prompt through dense vector semantic retrieval, multi-layer HNSW nearest neighbor graph search, continuous batching in PagedAttention, and pipeline-parallel 1F1B forward/backward execution on a GPU cluster.',
    targetSla: 'End-to-End Latency < 1,200ms; TTFT (Time to First Token) < 180ms; GPU VRAM Waste < 4%',
    stages: [
      {
        id: 'stage-rag-dense',
        name: 'Hybrid Semantic Retrieval',
        domain: 'rag',
        icon: '📚',
        description: 'Dense embedding query combined with BM25 keyword search via Reciprocal Rank Fusion (RRF).',
        latencyBudgetMs: 35,
        inputPayload: 'User query text + query embedding vector (1536-dim)',
        outputPayload: 'Top-50 candidate chunk IDs with fused reciprocal scores',
        actionSummary: 'Execute hybrid retrieval and pack context into U-shaped token budget window.',
        scenarioId: 'lost-in-middle',
      },
      {
        id: 'stage-vdb-hnsw',
        name: 'Vector Graph k-NN Index Search',
        domain: 'vectordb',
        icon: '🔍',
        description: 'Traverses hierarchical multi-layer skip-list HNSW graph with cosine distance pruning.',
        latencyBudgetMs: 25,
        inputPayload: 'Target query vector + efSearch parameter (default: 64)',
        outputPayload: 'Top-k closest chunk vector coordinates and layer traversal path',
        actionSummary: 'Navigate Layer 2 entry point down to Layer 0 neighbor list.',
      },
      {
        id: 'stage-llm-batching',
        name: 'Continuous Batching & PagedAttention',
        domain: 'llm-serving',
        icon: '🧠',
        description: 'Virtual memory block manager allocates non-contiguous KV-cache pages without internal fragmentation.',
        latencyBudgetMs: 40,
        inputPayload: 'Aggregated context prompt tokens (1,024 tokens) + sampling hyperparameters',
        outputPayload: 'Dynamic sequence batch with prefill KV-cache block table mappings',
        actionSummary: 'Allocate 64 physical KV blocks from free pool and schedule iteration step.',
      },
      {
        id: 'stage-gpu-1f1b',
        name: '1F1B Distributed GPU Execution',
        domain: 'gpu-cluster',
        icon: '🖥️',
        description: 'Executes One-Forward-One-Backward pipeline scheduling across 4 NVLink interconnected GPU stages.',
        latencyBudgetMs: 80,
        inputPayload: 'Micro-batch activation tensors across pipeline ranks 0..3',
        outputPayload: 'Final layer logits and predicted next-token probability distribution',
        actionSummary: 'Advance 1F1B clock tick to drain micro-batch bubbles across GPU ranks.',
      },
    ],
  },
  {
    id: 'social-feed-pipeline',
    title: 'High-Throughput Social Timeline Fan-out',
    subtitle: 'From Real-Time Ingestion to Cache and LSM Compaction',
    badge: 'Streaming & Storage',
    color: '#6366f1',
    description:
      'Simulates a viral celebrity event ingestion across Kafka partitioned brokers, real-time fanout consumer group workers updating Redis ZSET timelines, and asynchronous durable SSTable flush in LSM storage.',
    targetSla: 'Ingestion Throughput: 150,000 events/sec; Fan-out Delivery < 500ms; Storage P99 Write < 10ms',
    stages: [
      {
        id: 'stage-kafka-ingest',
        name: 'Partitioned Stream Ingestion',
        domain: 'kafka',
        icon: '⚡',
        description: 'Producer batches message to partition leader broker with acks=all and in-sync replica persistence.',
        latencyBudgetMs: 15,
        inputPayload: 'JSON Tweet payload with user_id, timestamp, and content hash',
        outputPayload: 'Offset committed to topic "tweets" partition 0 (Leader: Broker 1)',
        actionSummary: 'KRaft consensus validates leader epoch and advances high watermark.',
        scenarioId: 'leader-failover',
      },
      {
        id: 'stage-redis-fanout',
        name: 'In-Memory Timeline Caching',
        domain: 'redis',
        icon: '⚡',
        description: 'Consumer worker updates follower timeline Redis Cluster Sorted Sets (ZSET) partitioned across 16,384 slots.',
        latencyBudgetMs: 20,
        inputPayload: 'User follower IDs list (batch of 10,000 user timelines)',
        outputPayload: 'Atomic ZADD key="timeline:{user_id}" score={timestamp} member={tweet_id}',
        actionSummary: 'Pipeline ZADD commands across master nodes and replicate to read-replicas.',
      },
      {
        id: 'stage-storage-lsm',
        name: 'LSM-Tree MemTable & SSTable Flush',
        domain: 'storage',
        icon: '💾',
        description: 'Write-Ahead Log (WAL) append + MemTable red-black tree write, followed by background Level-0 SSTable flush.',
        latencyBudgetMs: 30,
        inputPayload: 'Immutable immutableMemTable snapshot (64MB batch)',
        outputPayload: 'Sorted String Table file written to Level 0 disk with Bloom filter index',
        actionSummary: 'Flush MemTable to L0 SSTable and trigger size-tiered background compaction.',
      },
    ],
  },
  {
    id: 'fintech-checkout-pipeline',
    title: 'Mission-Critical FinTech Payment Saga',
    subtitle: 'From Edge Rate Limiting to CAS Distributed Locks and 2PC/Saga',
    badge: 'Distributed Transactions',
    color: '#10b981',
    description:
      'Guarantees strict idempotency, rate limiting, distributed inventory isolation with monotonically increasing fencing tokens, and automated compensating reverse transactions under failure.',
    targetSla: 'Zero double charges; 100% mutual exclusion on inventory; Linearizable state consistency',
    stages: [
      {
        id: 'stage-rl-gate',
        name: 'Edge Quota & Token Bucket Guard',
        domain: 'rate-limiter',
        icon: '🛡️',
        description: 'Edge API gateway validates client token bucket quota to prevent credit card stuffing attacks.',
        latencyBudgetMs: 5,
        inputPayload: 'Client API Key + IP token + Request cost (1 token)',
        outputPayload: 'Admitted HTTP 200 (Remaining quota: 99/100, Refill: 10 tok/sec)',
        actionSummary: 'Atomically decrement client token bucket without lock contention.',
        scenarioId: 'boundary-burst',
      },
      {
        id: 'stage-lock-fencing',
        name: 'Fenced Inventory Mutual Exclusion',
        domain: 'distributed-lock',
        icon: '🔒',
        description: 'Acquires distributed lease generating monotonic fencing token to prevent split-brain writes during GC pauses.',
        latencyBudgetMs: 12,
        inputPayload: 'Resource ID "sku-item-987" + TTL 5000ms',
        outputPayload: 'Lock acquired with Fencing Token #1042',
        actionSummary: 'Issue lease and attach Fencing Token to downstream database mutation.',
        scenarioId: 'kleppmann-gc-pause',
      },
      {
        id: 'stage-txn-saga',
        name: 'Saga Orchestrated Settlement',
        domain: 'transactions',
        icon: '💳',
        description: 'Executes multi-step forward payment flow with automatic compensating LIFO reverse actions if inventory fails.',
        latencyBudgetMs: 50,
        inputPayload: 'Saga ID "order-4401" with steps: [Authorize, Deduct Stock, Charge, Deliver]',
        outputPayload: 'Transaction committed or cleanly compensated with zero leaked locks',
        actionSummary: 'Execute forward steps with persistent WAL logging at each stage boundary.',
        scenarioId: 'coordinator-crash',
      },
    ],
  },
];
