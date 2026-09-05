# TheVisualizer — Interactive Distributed Systems & System Design Simulation Platform

A high-performance, deterministic simulation, visualization, and chaos engineering platform for **18 distributed systems and AI infrastructure architectures**.

TheVisualizer makes invisible distributed system and AI infrastructure behaviors visible, allowing engineers, SREs, and architects to model, test, and master complex protocol mechanics—including **consensus quorums**, **partition log storage**, **distributed locks**, **rate limiting algorithms**, **hierarchical edge caching**, **64-bit snowflake ID generation**, **2PC vs Saga transactions**, **congestion control**, **Modular RAG & RRF fusion**, **Autonomous Agent Swarms**, **PagedAttention KV caching**, **HNSW vector graphs**, and **GPU 3D Parallelism with 1F1B pipelining**—in real time with zero-I/O discrete-event simulation.

---

## 🧭 Visualizer Navigation Matrix (18 Domains)

Every domain is accessible directly via its own dedicated routing endpoint (`http://localhost:3002/[domain]`):

| Domain | Route | Architecture & Standard | Key Interactive Features | Verified Invariants |
| :--- | :--- | :--- | :--- | :--- |
| **Apache Kafka** | [`/kafka`](http://localhost:3002/kafka) | KRaft Consensus, Log Segments, KIP-98 | Murmur2 partitioner sandbox, broker crash/recovery, consumer rebalance, log compaction | `KAFKA-1` (ISR Monotonicity)<br>`KAFKA-2` (Producer Dedup) |
| **Raft Consensus** | [`/raft`](http://localhost:3002/raft) | Ongaro & Ousterhout 2014, etcd/raft | Leader elections, randomized timers, log replication, PreVote extension, split-brain isolation | `RAFT-1` (Election Safety)<br>`RAFT-2` (Leader Append-Only) |
| **Distributed Database** | [`/database`](http://localhost:3002/database) | Amazon Dynamo / Cassandra 5.0 | Consistent hash ring, 256 vnodes, tunable consistency (ONE/QUORUM/ALL), hinted handoff | `DB-1` (Read Your Writes)<br>`DB-2` (Quorum Overlap) |
| **Redis Cluster** | [`/redis`](http://localhost:3002/redis) | Redis 7.2+ Cluster Specification | 16,384 hash slots, CRC16 hashtags, MOVED vs ASK redirects, 8 eviction policies | `REDIS-1` (Slot Totality)<br>`REDIS-2` (Eviction Threshold) |
| **Kubernetes** | [`/kubernetes`](http://localhost:3002/kubernetes) | Kubernetes v1.31 Control Plane | Node allocatable CPU/RAM bars, kube-scheduler, QoS eviction (`BestEffort` first), rolling update surge/PDB | `K8S-1` (QoS Eviction Priority)<br>`K8S-2` (PDB MinAvailable) |
| **RabbitMQ** | [`/rabbitmq`](http://localhost:3002/rabbitmq) | AMQP 0-9-1 & Quorum Queues | Direct/Topic/Fanout exchanges, Dead-Letter Exchange (DLX), `basic.qos` prefetch, priority queues | `RMQ-1` (Prefetch Clamp)<br>`RMQ-2` (DLX Delivery) |
| **Storage Engines** | [`/storage`](http://localhost:3002/storage) | SQLite 3 B+Tree vs RocksDB 9.0 LSM | Side-by-side B+Tree page splits vs Leveled SSTable compaction, dynamic Bloom filter false-positive rate | `STORAGE-1` (B+Tree Sortedness)<br>`STORAGE-2` (MemTable Flush) |
| **TCP Networking** | [`/networking`](http://localhost:3002/networking) | RFC 793, RFC 5681, Linux Kernel 6.x | 3-way handshake ladder, sliding window byte buffer, CUBIC ($W_{cubic}$) vs Reno AIMD congestion curves | `NET-1` (Sequence Monotonicity)<br>`NET-3` (Mode-Aware Multiplier) |
| **Rate Limiter** | [`/rate-limiter`](http://localhost:3002/rate-limiter) | RFC 2697 srTCM, Cloudflare spec | 5-algorithm side-by-side comparison, bucket drain/refill, boundary burst spotlight, local-memory multiplier | `RL-1` (Capacity Bound)<br>`RL-2` (Rate Never Exceeded)<br>`RL-3` (Boundary Burst Flaw)<br>`RL-4` (Approximation Bound) |
| **Distributed Lock** | [`/distributed-lock`](http://localhost:3002/distributed-lock) | Redlock Quorum, Kleppmann 2016 critique | 5-node Redlock quorum, Raft lease authority, Martin Kleppmann GC-pause race injection, downstream fencing ledger | `LOCK-1` (Fencing Enforcement)<br>`LOCK-2` (Redlock Quorum)<br>`LOCK-3` (Lease Liveness)<br>`LOCK-4` (GC Pause Hazard) |
| **CDN & Caching** | [`/cdn-cache`](http://localhost:3002/cdn-cache) | RFC 9111 HTTP Caching, RFC 5861 SWR | Edge PoPs (US/EU/AP) $\to$ Regional Shield $\to$ Origin, flash-crowd stampede, single-flight coalescing, purge wave | `CDN-1` (Staleness Bound)<br>`CDN-2` (Coalescing Stampede Prevention)<br>`CDN-3` (Purge Propagation)<br>`CDN-4` (Tiered Offload) |
| **ID Generation** | [`/id-gen`](http://localhost:3002/id-gen) | Twitter Snowflake, RFC 9562 UUIDv7 | 64-bit binary bit-field breakdown (1-41-10-12), NTP backward clock skew refusal, 12-bit sequence rollover, B+Tree sortability | `ID-1` (Global Uniqueness)<br>`ID-2` (Per-Worker Monotonicity)<br>`ID-3` (Clock Skew Refusal)<br>`ID-4` (Sequence Overflow Protection) |
| **Distributed Txns** | [`/transactions`](http://localhost:3002/transactions) | Jim Gray 1978 2PC, Garcia-Molina 1987 Saga | 2PC participant swimlane, coordinator-crash blocking hazard demonstration, Saga forward steps with reverse LIFO compensation | `TXN-1` (2PC Atomicity)<br>`TXN-2` (2PC Blocking Hazard)<br>`TXN-3` (Saga LIFO Compensation)<br>`TXN-4` (Eventual Consistency) |
| **Modular RAG** | [`/rag`](http://localhost:3002/rag) | Lewis et al. 2020, Cormack RRF 2009 | Hybrid sparse + dense retrieval, Reciprocal Rank Fusion combiner, Cross-Encoder reranking, Lost-in-the-Middle mitigation | `RAG-1` (RRF Monotonicity)<br>`RAG-2` (Context Length Bound)<br>`RAG-3` (Lost-in-the-Middle Reorder)<br>`RAG-4` (Reranker Precision) |
| **Agent Swarms** | [`/agents`](http://localhost:3002/agents) | AutoGPT, CrewAI, Yao et al. ReAct | Multi-agent communication topologies (Star / Mesh / Hierarchical), Thought-Action-Observation loops, shared memory, dead-letters | `AGENT-1` (Message Delivery Guarantee)<br>`AGENT-2` (Memory Concurrency Safe)<br>`AGENT-3` (Recursion Depth Bound)<br>`AGENT-4` (Role Output Conformance) |
| **LLM Serving** | [`/llm-serving`](http://localhost:3002/llm-serving) | vLLM PagedAttention (SOSP '23), Orca | KV-cache virtual page table, prefill vs decode phase visualization, continuous iteration-level batching, token eviction | `LLM-1` (Zero Fragmentation KV Pages)<br>`LLM-2` (Continuous Batch Fairness)<br>`LLM-3` (Prefill Prioritization)<br>`LLM-4` (Context Window Preservation) |
| **Vector Database** | [`/vectordb`](http://localhost:3002/vectordb) | Malkov & Yashunin HNSW (TPAMI '18) | Multi-layer HNSW graph visualization, entry point skip-list traversal, dynamic $efSearch$ beam exploration, IVFPQ quantization | `VEC-1` (HNSW Layer Monotonicity)<br>`VEC-2` (Recall-Latency Tradeoff)<br>`VEC-3` (Quantization Error Bound)<br>`VEC-4` (Dynamic Index Stability) |
| **GPU Cluster** | [`/gpu-cluster`](http://localhost:3002/gpu-cluster) | Megatron-LM 3D, Narayanan 1F1B | Data / Tensor / Pipeline 3D parallelism topology, NVLink vs InfiniBand interconnect saturation, 1F1B schedule bubble minimization | `GPU-1` (3D Tensor Size Conservation)<br>`GPU-2` (1F1B Pipeline Activation Bound)<br>`GPU-3` (AllReduce Ring Consistency)<br>`GPU-4` (NVLink Bandwidth Saturation) |

---

## 🌟 Platform Workflows & Architecture Features

### 1. Universal Cross-Domain Command Palette (`Cmd+K` / `Ctrl+K`)
- Global keyboard shortcut accessible from any view.
- Real-time full-text indexing across all **18 domains**, **50+ distributed systems concepts**, and simulation control actions.
- Keyboard navigation (`↑`, `↓`, `Enter`, `Escape`) with active element auto-scroll.

### 2. System Design Interview Prep Mode
- Interactive challenge suite featuring 6 curated tier-1 distributed systems and AI architecture problems:
  1. *Design a Global API Rate Limiter* (Sliding Window & Token Bucket)
  2. *Design a Distributed Lock Manager with Monotonic Fencing* (Kleppmann GC pause race)
  3. *Design a Real-Time Social Feed Fan-Out Engine* (KIP-848 cooperative sticky rebalance)
  4. *Design a High-Throughput 64-bit ID Generator* (NTP clock rollback refusal)
  5. *Design a Resilient Distributed Payment & Order Saga* (2PC coordinator crash vs Saga reverse compensation)
  6. *Design an Enterprise Modular RAG Pipeline* (Hybrid RRF & Lost-in-the-Middle context placement)
- Includes interactive candidate evaluation rubrics and one-click `▶ Simulate Drill` actions.

### 3. Multi-Domain Composite System Pipelines
- Visualizes real-world multi-stage architectures chaining multiple simulated domains:
  - **Enterprise AI Agent & Generation Pipeline**: `rag` $\to$ `vectordb` $\to$ `llm-serving` $\to$ `gpu-cluster`.
  - **High-Throughput Social Timeline Fan-Out**: `kafka` $\to$ `redis` $\to$ `storage`.
  - **Mission-Critical FinTech Payment Saga**: `rate-limiter` $\to$ `distributed-lock` $\to$ `transactions`.
- Interactive stage progression with latency budgets and direct simulation links.

### 4. Shareable Scenario Permalinks
- URL-safe base64 state serialization (`?p=...`) capturing domain, scenario, tick, and custom parameters.
- One-click clipboard copy with floating status toast and automatic client-side hydration.

### 5. Canvas Virtualization & 60 FPS Performance Telemetry HUD
- **Zero-GC ParticlePool**: Pre-allocated particle pool eliminating runtime garbage collection micro-stutters.
- **Dirty-State Layout Caching**: Caches node trigonometry and angles, executing math only when topology changes.
- **Frustum Culling**: Skips rendering off-screen brokers, partitions, nodes, and lines outside the camera viewport.
- **Glassmorphic 60 FPS HUD**: Displays live FPS gauge, frame duration budget bar ($< 16.67\text{ms}$), rendered vs culled entities, and particle pool reserves.

---

## 🌟 Core Architecture & Engineering Highlights

### 1. Zero-I/O Deterministic Discrete-Event Simulation (DDES)
- **Zero Unseeded Entropy**: Strict zero-entropy guarantee—zero calls to unseeded `Math.random()` or `Date.now()`. All pseudo-randomness is derived from a deterministic `DeterministicRNG` (SplitMix32).
- **Golden Determinism Suite**: 62/62 tests verifying identical SHA-256 state hashes across 100 ticks per domain, ensuring cross-platform, reproducible runs.
- **Headless Throughput**: Ultra-high simulation performance reaching **~25,000–50,000 ticks/sec** (benchmark target: $\ge 5,000$ ticks/sec).

### 2. Pedagogical Flaw Spotlights
Unlike toy simulators that artificially prevent failures, TheVisualizer intentionally stages real-world distributed system edge cases:
- **Fixed Window Boundary Burst (`RL-3`)**: Demonstrates $2\times$ quota admission across clock boundaries.
- **Kleppmann GC-Pause Race (`LOCK-4`)**: Proves why downstream monotonic fencing tokens (`LOCK-1`) are mandatory.
- **Cache Stampede Thundering Herd (`CDN-2`)**: Compares single-flight origin request coalescing against naive parallel misses.
- **2PC Coordinator Crash Blocking (`TXN-2`)**: Strands participants in an indefinite `BLOCKED_UNCERTAIN` state holding resource locks.
- **NTP Backward Clock Skew (`ID-3`)**: Demonstrates worker generation refusal when system clocks retreat.
- **Lost-in-the-Middle Context Degradation (`RAG-3`)**: Proves semantic retrieval recall drops when relevant chunks are placed in middle positions versus boundaries.

---

## 🛠️ Monorepo Structure

```text
the-visualizer/
├── apps/
│   ├── web/                    # Next.js 15 App Router (Canvas renderer, HUD, 18 visualizers, E2E)
│   ├── api/                    # Hono REST API with Drizzle ORM (PostgreSQL & Redis)
│   └── ws-gateway/             # Stateful WebSocket Gateway (MessagePack, rate limits, session runner)
├── packages/
│   ├── simulation/             # Pure deterministic simulation engine, reducers, and invariants (18 domains)
│   ├── contracts/              # Shared Zod schemas, domain types, and wire protocol definitions
│   ├── config/                 # Monorepo environment configuration and validation
│   ├── logging/                # Structured Pino logging & OpenTelemetry metrics
│   ├── ui/                     # Design system primitives, tokens, and visual components
│   └── test-utils/             # Deterministic PRNG helpers, factories, and test harnesses
├── infrastructure/             # k6 automated load test suites (api.js, websocket.js)
├── docs/                       # Architecture specifications, runbooks, and fidelity references
│   ├── FEATURE_EXPLAINER.md    # In-depth architectural breakdown of all 18 domains
│   └── architecture/
│       └── FIDELITY_REFERENCES.md # Formal RFC citations and config knob parity tables
└── docker-compose.yml          # Multi-container production stack (Postgres, Redis, API, WS, Web)
```

---

## 🚦 Quick Start

### 1. Docker Compose (Full Stack)

```bash
# Build and run Postgres, Redis, API, WS-Gateway, and Web
docker compose up --build -d
```

Service endpoints:
- **Web Canvas UI**: `http://localhost:3002`
- **REST API**: `http://localhost:3000`
- **WebSocket Gateway**: `ws://localhost:3001`

### 2. Local Development

Prerequisites: Node.js 20+ or 24, pnpm 10+.

```bash
# 1. Install workspace dependencies
pnpm install

# 2. Start backing services (Redis on 6379, Postgres on 5432)
docker compose up redis postgres -d

# 3. Apply database migrations
pnpm --filter @the-visualizer/api db:migrate

# 4. Start all apps in watch mode
pnpm dev
```

---

## 🧪 Testing, Benchmarks & Verification Suite

```bash
# 1. Type-check all 9 workspace packages (0 errors)
pnpm typecheck

# 2. Run the 62-test Golden Determinism Suite
pnpm test:determinism

# 3. Run all test suites across the entire monorepo (308 tests, 62 files)
pnpm test:all

# 4. Run the 18-Domain Behavioral Verification Suite (23/23 checks)
pnpm verify:all

# 5. Run the Canvas 60 FPS Stress Benchmark (1,000 frames)
pnpm benchmark:canvas

# 6. Run the Playwright Browser E2E Suite (25/25 tests across all domains)
pnpm test:e2e
```

---

## 🛡️ CI/CD Quality Gates

Every pull request and merge to `main` must pass **16 automated quality gates** in GitHub Actions:

1. **Build All Packages & Apps**: Turbo monorepo production build.
2. **TypeScript Check**: Strict `--noEmit` type checking across all 9 packages.
3. **Lint & Format**: ESLint and Prettier compliance across all workspaces.
4. **Unit Tests**: 308 unit tests covering simulation algorithms, contracts, and components.
5. **Golden Determinism Gate**: 62/62 determinism tests ensuring SHA-256 state stability.
6. **Integration Tests**: End-to-end API route and database integration tests.
7. **Automated Load Testing & Latency Gate**: k6 load test execution (`api.js` and `websocket.js`).
8. **Rate Limiting & 1MB Frame Cap Gate**: WebSocket rate limiting and payload enforcement verification.
9. **Token Revocation E2E Enforcement**: Real-time Redis-backed JWT token revocation verification.
10. **WebSocket Concurrency & Zero-Drop Gate**: Multi-client concurrent frame processing verification.
11. **WCAG 2.1 AA Production Route Scan**: Automated axe-core accessibility audit across all routes.
12. **Lighthouse Performance Audit**: Headless Lighthouse audit verifying Core Web Vitals.
13. **Generate SBOM**: Software Bill of Materials generation using Anchore Syft.
14. **Docker Image Pinning Enforcement**: Cryptographic SHA-256 and alpine base tag validation.
15. **Secret Scanning**: Gitleaks secret leak detection.
16. **Container Security Scan**: Trivy vulnerability scanning on release branches.

---

## 📖 Further Documentation

- [**18-Domain Feature Explainer**](docs/FEATURE_EXPLAINER.md): Deep-dive domain explanations, invariants, visual canvas mechanics, and chaos playbooks.
- [**Fidelity References & Knob Parity**](docs/architecture/FIDELITY_REFERENCES.md): Authoritative RFC specifications, academic papers, and configuration mapping tables.
- [**Production Readiness Runbook**](docs/runbooks/production-readiness.md): Production checklist, SLO targets, and verification procedures.
- [**Hosting & Deployment Guide**](docs/deployment/HOSTING_GUIDE.md): ECS, Cloud Run, and Kubernetes deployment blueprints.
