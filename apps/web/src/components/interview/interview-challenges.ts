import type { DomainKey } from '../../app/domain-options';

export interface InterviewChallenge {
  id: string;
  title: string;
  difficulty: 'Medium' | 'Hard';
  companyTags: string[];
  domain: DomainKey;
  scenarioId: string;
  drillLabel: string;
  problemStatement: string;
  sla: string;
  components: string[];
  tradeoffs: {
    title: string;
    description: string;
  }[];
  interviewerChecklist: string[];
  solutionSummary: string;
}

export const INTERVIEW_CHALLENGES: InterviewChallenge[] = [
  {
    id: 'rate-limiter-burst',
    title: 'Design a Global API Rate Limiter',
    difficulty: 'Medium',
    companyTags: ['Stripe', 'Cloudflare', 'DoorDash', 'GitHub'],
    domain: 'rate-limiter',
    scenarioId: 'boundary-burst',
    drillLabel: '▶ Simulate Sliding-Window Boundary Burst',
    problemStatement:
      'Design a resilient, high-throughput rate limiter capable of protecting critical internal microservices from traffic spikes, DDoS, and rogue clients across multi-region deployments.',
    sla: 'Throughput: >1,000,000 req/sec; Latency overhead: <2ms (p99); Availability: 99.999%',
    components: [
      'Edge API Gateway / Envoy proxy with local token cache',
      'Distributed Redis Cluster / MemoryStore for global counters',
      'Token Bucket / Leaky Bucket / Sliding Window Counter algorithms',
      'Config service (Zookeeper / Consul / etcd) for dynamic quota management',
    ],
    tradeoffs: [
      {
        title: 'Token Bucket vs Sliding Window Counter',
        description:
          'Token Bucket consumes minimal memory O(1) and handles legitimate bursts gracefully, whereas Fixed Window suffers 2x quota spike at boundary resets. Sliding Window Counter provides perfect precision at the cost of O(k) CPU calculation.',
      },
      {
        title: 'Centralized Redis vs Local In-Memory with Sync',
        description:
          'Synchronous Redis queries ensure strict consistency across regions but add 2-5ms network round-trip overhead. Local in-memory caching with batched asynchronous sync provides sub-millisecond responses at the expense of temporary quota overages.',
      },
    ],
    interviewerChecklist: [
      'Identified client identification strategy (IP address vs API key vs user ID token).',
      'Discussed HTTP 429 response headers (X-RateLimit-Limit, X-RateLimit-Remaining, Retry-After).',
      'Addressed distributed race conditions (atomic Redis Lua scripts vs Redis sorted sets).',
      'Formulated graceful degradation fallback if counter cluster fails (fail-open vs fail-closed).',
    ],
    solutionSummary:
      'Employ a hybrid architecture: edge reverse proxies execute local Token Bucket checks for common clients and asynchronously batch quota reconciliations to a Redis cluster running Lua scripts. Fail-open with telemetry alerts if the cache tier drops.',
  },
  {
    id: 'distributed-lock-fencing',
    title: 'Design a Distributed Lock Manager with Fencing Tokens',
    difficulty: 'Hard',
    companyTags: ['Google', 'AWS', 'Airbnb', 'Snowflake'],
    domain: 'distributed-lock',
    scenarioId: 'kleppmann-gc-pause',
    drillLabel: '▶ Simulate Kleppmann GC Pause Lock Steal',
    problemStatement:
      'Design a distributed locking service for mutually exclusive resource modification (e.g. inventory allocation, billing deduplication) that guarantees safety even under node crashes, network partitions, and arbitrary garbage collection pauses.',
    sla: 'Correctness: Linearizable mutual exclusion (zero dual-primary writes); Lock acquisition latency: <10ms; Lease auto-expiry',
    components: [
      'Consensus cluster (ZooKeeper / etcd / Raft) or multi-node Redlock',
      'Monotonically increasing Fencing Token generator',
      'Storage backend / Shared database with conditional fencing token validation (CAS write)',
      'Client lease renewal heartbeat thread with jittered backoff',
    ],
    tradeoffs: [
      {
        title: 'Redlock vs Consensus-backed Leases (etcd/ZK)',
        description:
          'Redlock relies on synchronized physical clocks and NTP bounds, making it vulnerable to clock jumps and process pauses (as proven by Martin Kleppmann). etcd/ZooKeeper rely on consensus (Raft/ZAB) and provide strict linearizable leases with monotonic zxid/raft-term tokens.',
      },
      {
        title: 'Optimistic Fencing Tokens vs Pessimistic Long Locks',
        description:
          'Pessimistic locks block all concurrent readers and writers, risking deadlocks and stranded resources if a client dies. Optimistic fencing tokens allow safe writes without holding locks indefinitely, shifting verification to the storage CAS boundary.',
      },
    ],
    interviewerChecklist: [
      'Analyzed process pause scenario: client acquires lock, pauses for 30s during GC, lease expires, second client acquires lock, first client resumes and issues stale write.',
      'Explained Fencing Tokens: why monotonically increasing tokens at the storage layer solve the split-brain write problem.',
      'Critiqued NTP clock drift and leap-second risks in distributed timestamp-dependent protocols.',
      'Designed dead-lock prevention through bounded TTLs and proactive heartbeats.',
    ],
    solutionSummary:
      'Use consensus-backed leases (etcd/ZooKeeper) issuing monotonically increasing 64-bit fencing tokens. The shared resource/storage layer rejects any transaction where token < current_max_token, neutralizing process pause and partition hazards.',
  },
  {
    id: 'kafka-timeline-fanout',
    title: 'Design a Real-Time Social Feed & Timeline Fan-out',
    difficulty: 'Hard',
    companyTags: ['Twitter/X', 'Meta', 'LinkedIn', 'Uber'],
    domain: 'kafka',
    scenarioId: 'cooperative-rebalance',
    drillLabel: '▶ Simulate KIP-848 Cooperative Rebalance Drill',
    problemStatement:
      'Architect a scalable real-time activity timeline supporting 500 million active users where celebrity posts fan out to tens of millions of followers with sub-second delivery latency.',
    sla: 'Fan-out p95 latency: <500ms; Write ingestion: 150,000 tweets/sec; Read timeline requests: 2,000,000 req/sec',
    components: [
      'Kafka event bus with partitioned topic ingestion (user_id partition keys)',
      'Fan-out service workers running KIP-848 consumer groups',
      'Redis cluster storing pre-computed timelines (ZSET sorted by timestamp)',
      'Hybrid Fan-out engine (Push on write for regular users, Pull on read for celebrities)',
    ],
    tradeoffs: [
      {
        title: 'Fan-out-on-Write (Push) vs Fan-out-on-Read (Pull)',
        description:
          'Push updates follower timelines at write time, ensuring instant O(1) timeline reads but creating write amplification for accounts with 50M+ followers. Pull merges timelines at read time, avoiding write amplification but causing slow reads.',
      },
      {
        title: 'Cooperative Sticky Rebalance vs Eager Rebalance',
        description:
          'Eager rebalancing revokes all partitions during consumer membership changes, causing stop-the-world timeline processing spikes. KIP-848 cooperative rebalancing reassigns only migrated partitions incrementally without dropping active partitions.',
      },
    ],
    interviewerChecklist: [
      'Defined celebrity / high-fanout optimization (e.g. users with >25k followers use pull-on-read).',
      'Calculated storage sizing for Redis user timeline caches (800 items per user * 8 bytes * 500M users).',
      'Handled partition hotspotting on high-volume user activity via salt keys.',
      'Explored Kafka consumer group rebalance mechanics and partition assignment protocols.',
    ],
    solutionSummary:
      'Implement hybrid push/pull fan-out: regular posts are fanned out to follower Redis ZSET timelines via partitioned Kafka consumer groups. Celebrity posts bypass fanout and are dynamically merged into user timelines at query time.',
  },
  {
    id: 'id-gen-snowflake',
    title: 'Design a High-Throughput 64-bit Distributed ID Generator',
    difficulty: 'Medium',
    companyTags: ['Twitter/X', 'Discord', 'Instagram', 'ByteDance'],
    domain: 'id-gen',
    scenarioId: 'clock-backward',
    drillLabel: '▶ Simulate NTP Clock Rollback & Monotonic Drift',
    problemStatement:
      'Design a decentralized 64-bit unique identifier generation system (Snowflake/Sonyflake/ULID) that is roughly time-sortable, k-ordered, generates zero collisions, and operates without cross-node network round-trips.',
    sla: 'Throughput: >10,000 IDs/sec per worker node; 64-bit integer fit; Monotonically increasing order; Zero coordination per ID',
    components: [
      '41-bit Epoch Milliseconds timestamp component (~69 years lifespan)',
      '10-bit Node/Machine ID coordinator (etcd/Consul lease assignment)',
      '12-bit Monotonic sequence counter (4,096 IDs per millisecond per node)',
      'Hardware clock / NTP synchronization daemon with leap-second smoothing (slewing)',
    ],
    tradeoffs: [
      {
        title: '64-bit Integer vs 128-bit UUIDv7 / ULID',
        description:
          '64-bit Snowflake fits natively into B-Tree index primary keys without memory bloat, whereas 128-bit UUIDs double index size and reduce cache line density, but avoid machine-id coordination.',
      },
      {
        title: 'NTP Step Correction vs Slewing during Clock Drift',
        description:
          'Abrupt NTP step backwards causes timestamp collisions or requires blocking generation until time catches up. Clock slewing gradually adjusts clock skew to preserve strict forward monotonicity.',
      },
    ],
    interviewerChecklist: [
      'Explained bit layout breakdown (1 sign bit + 41 timestamp + 10 machine + 12 sequence).',
      'Demonstrated failure mitigation when local clock drifts backward (wait, reject, or borrow sequence from next ms).',
      'Addressed worker ID exhaustion and automated release upon machine termination.',
      'Analyzed performance implications on secondary index clustering (sequential insert vs random fragmentation).',
    ],
    solutionSummary:
      'Deploy stateless Snowflake generation daemons configured with etcd-leased machine IDs. If local NTP drifts backwards by <5ms, spin-wait; if >5ms, trigger alert and switch to logical sequence increment until physical clock catches up.',
  },
  {
    id: 'transactions-saga',
    title: 'Design a Resilient Distributed Payment & Order Saga',
    difficulty: 'Hard',
    companyTags: ['Stripe', 'Amazon', 'Uber', 'Square'],
    domain: 'transactions',
    scenarioId: 'coordinator-crash',
    drillLabel: '▶ Simulate 2PC Coordinator Crash & In-Doubt Deadlock',
    problemStatement:
      'Design an atomic, resilient multi-service payment flow (Authorize Payment -> Reserve Inventory -> Charge Customer -> Dispatch Delivery) across heterogeneous autonomous microservices without distributed blocking locks.',
    sla: 'Eventual consistency guaranteed; Zero money lost / double charges; High write throughput; Automatic compensation on failure',
    components: [
      'Saga Execution Orchestrator (State machine engine with persistent WAL)',
      'Compensating transaction definitions for each forward action (Refund, Release, Cancel)',
      'Idempotency key registry with unique constraint enforcement',
      'Dead-letter queue (DLQ) and manual reconciliation dashboard for unrecoverable errors',
    ],
    tradeoffs: [
      {
        title: 'Two-Phase Commit (2PC) vs Saga Pattern',
        description:
          '2PC guarantees strict ACID serializability across participants but holds blocking row locks during prepare phase, creating single-point-of-failure and in-doubt deadlocks if coordinator crashes. Saga provides high availability through local transactions and asynchronous compensation.',
      },
      {
        title: 'Orchestrated Saga vs Choreographed Saga',
        description:
          'Orchestrated Saga centralizes workflow logic, timeouts, and compensation tracking in a dedicated coordinator. Choreographed Saga relies on distributed pub/sub events, eliminating a central service but risking cyclic dependencies and hard-to-trace failure states.',
      },
    ],
    interviewerChecklist: [
      'Contrasted 2PC synchronous blocking lock risks with Saga asynchronous compensating actions.',
      'Addressed idempotent payment execution (client idempotency keys stored in database).',
      'Handled concurrent semantic anomalies (dirty reads during forward execution before compensation).',
      'Designed WAL recovery mechanism to resume in-flight sagas after coordinator hardware restart.',
    ],
    solutionSummary:
      'Adopt an Orchestrated Saga engine with a persistent Write-Ahead Log. Each microservice implements idempotent forward and backward compensating actions. If a downstream step fails, the orchestrator triggers reverse LIFO compensations.',
  },
  {
    id: 'rag-lost-in-middle',
    title: 'Design an Enterprise RAG & Semantic Retrieval Pipeline',
    difficulty: 'Hard',
    companyTags: ['OpenAI', 'Anthropic', 'Google Cloud', 'Cohere', 'Palantir'],
    domain: 'rag',
    scenarioId: 'lost-in-middle',
    drillLabel: '▶ Simulate Hybrid RRF & Lost-in-the-Middle Mitigation',
    problemStatement:
      'Design an enterprise-grade Retrieval-Augmented Generation (RAG) platform querying tens of millions of technical documents, mitigating vector semantic hallucinations, citation drift, and LLM attention degradation (Lost-in-the-Middle effect).',
    sla: 'Retrieval p95 latency: <120ms; Generation end-to-end: <1.5s; Citation fidelity: 99.5%',
    components: [
      'Document chunking & embedding pipeline with metadata tagging',
      'Hybrid Retrieval: Dense Vector index (HNSW/IVF-PQ) + Sparse BM25 / SPLADE index',
      'Reciprocal Rank Fusion (RRF) rank combiner',
      'Cross-Encoder Re-ranker (e.g. Cohere / BGE-Reranker) with U-shaped context placement',
    ],
    tradeoffs: [
      {
        title: 'Dense Embeddings vs Sparse Keyword (BM25) vs Hybrid',
        description:
          'Dense vector retrieval captures deep semantic intent but struggles with exact SKU, function names, and alphanumeric codes. Sparse BM25 excels at exact keyword match. Hybrid RRF achieves optimal precision by combining reciprocal rank signals.',
      },
      {
        title: 'Chunk Size (256 tokens vs 1024 tokens)',
        description:
          'Smaller chunks (128-256 tokens) yield fine-grained vector similarity and low noise, but lose document context. Larger chunks (1024 tokens) preserve narrative context but dilute embedding vectors with multiple topics.',
      },
    ],
    interviewerChecklist: [
      'Explained Reciprocal Rank Fusion (RRF) formula: score = sum(1 / (60 + rank_i)).',
      'Addressed LLM positional bias (Lost-in-the-Middle): placing highest-relevance documents at first and last prompt positions.',
      'Discussed context compression and token budgeting prior to LLM generation.',
      'Designed citation provenance tracking to ground claims with exact page/line references.',
    ],
    solutionSummary:
      'Deploy a multi-stage RAG retrieval engine: initial query fans out to HNSW dense vector search and BM25 sparse index; candidates are merged using Reciprocal Rank Fusion (RRF); top-50 results are re-ranked with a Cross-Encoder and formatted in a U-shaped layout to counteract positional attention decay.',
  },
];
