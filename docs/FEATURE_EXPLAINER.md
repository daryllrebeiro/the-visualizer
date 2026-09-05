# TheVisualizer: 18-Domain Distributed Systems & AI Infrastructure Feature Explainer

**TheVisualizer** is an interactive, deterministic, real-time simulation and visualization platform for distributed systems, storage engines, transport protocols, system design interview canon, and AI infrastructure architectures. Every visualizer in this monorepo is accessible via its own unique, direct routing endpoint (`/[domain]`), backed by a zero-I/O Deterministic Discrete-Event Simulation (DDES) engine, real-world protocol invariants, and interactive chaos injection controls.

---

## Visualizer Navigation Matrix (18 Domains)

| Visualizer Domain        | Unique Routing Endpoint                                                  | Visual Representation                                                        | Key Interactive Controls                                                       | Real-World Fidelity Highlight                                                 |
| :----------------------- | :----------------------------------------------------------------------- | :--------------------------------------------------------------------------- | :----------------------------------------------------------------------------- | :---------------------------------------------------------------------------- |
| **Apache Kafka**         | [`/kafka`](#1-apache-kafka-visualizer-kafka)                             | Partition log segments, brokers, consumer groups, animated packet envelopes  | Keyed message produce, broker crash/recover, rebalance trigger                 | Monotonic Epochs, KIP-98 sequence dedup, `min.insync.replicas`                |
| **Raft Consensus**       | [`/raft`](#2-raft-consensus-visualizer-raft)                             | Cluster quorum ring, term counters, heartbeat countdowns, split-brain arcs   | Propose state command, crash/recover node, network partition isolate           | Raft Dissertation §9.6 Pre-Vote phase, randomized election timers             |
| **Distributed Database** | [`/database`](#3-distributed-database-visualizer-database)               | 32-bit consistent hash ring, virtual nodes (vnodes), key replica pointers    | Read/Write with tunable consistency (ONE/QUORUM/ALL), node scale-out           | Cassandra Murmur3, Vector Clocks, Hinted Handoff, 256 vnode density           |
| **Redis Cluster**        | [`/redis`](#4-redis-cluster-visualizer-redis)                            | 16,384 hash slots, master-replica shards, slot ranges, eviction radar        | SET/GET/DEL key, slot resharding, crash node, change eviction policy           | CRC16 hashtags, MOVED permanent vs ASK transient redirect, LRU/LFU/TTL        |
| **Kubernetes Cluster**   | [`/kubernetes`](#5-kubernetes-cluster-scheduler-kubernetes)              | Worker nodes with allocatable CPU/memory bars, scheduled pod cards           | Scale replica count, rollout image, cordon node, drain node, crash node        | QoS class eviction (`BestEffort` first), PodDisruptionBudget (`minAvailable`) |
| **RabbitMQ Broker**      | [`/rabbitmq`](#6-rabbitmq-amqp-broker-rabbitmq)                          | Interactive pipeline: Producers → Exchanges → Bindings → Queues → Consumers  | Publish with routing key, ACK, NACK (requeue=true), REJECT (to DLX)            | AMQP 0-9-1 bindings, Dead-Letter Exchange (DLX), `x-max-priority` heap        |
| **Storage Engines**      | [`/storage`](#7-storage-engine-internals-storage)                        | Side-by-side: Hierarchical B+Tree node blocks vs LSM Leveled SSTables        | Key write/read, switch engine, trigger flush to L0, trigger compaction         | SQLite format (Order $M=4$ vs $M \approx 170$), RocksDB dynamic Bloom FP rate |
| **TCP Networking**       | [`/networking`](#8-tcp-networking--congestion-control-networking)        | Packet flight rail, sliding window byte buffer, cwnd timeline chart          | 3-way handshake, send data payload, drop in-flight packet, teardown            | RFC 8312 CUBIC ($W_{cubic}$) vs Reno AIMD, RFC 6298 RTO granularity           |
| **Rate Limiter**         | [`/rate-limiter`](#9-rate-limiter-algorithms-rate-limiter)               | 5-algorithm comparative dashboard, bucket water level, window timeline       | Dispatch request/burst, trigger boundary burst, toggle Redis vs local memory   | RFC 2697 srTCM, Cloudflare sliding counter, boundary burst defect             |
| **Distributed Lock**     | [`/distributed-lock`](#10-distributed-lock-manager-distributed-lock)     | 5-node Redlock quorum grid, lock timeline, monotonic fencing ledger          | Acquire/release lock, inject GC pause, toggle fencing, partition node          | Martin Kleppmann GC pause critique, monotonic fencing tokens, Redlock quorum  |
| **CDN & Caching**        | [`/cdn-cache`](#11-cdn--multi-tier-caching-cdn-cache)                    | Geo PoP fleet (US/EU/AP) → Regional tiers → Origin, cache watermarks         | GET request, flash crowd stampede, single-flight coalescing toggle, purge wave | RFC 9111 HTTP semantics, stale-while-revalidate, request coalescing           |
| **ID Generation**        | [`/id-gen`](#12-distributed-id-generation-id-gen)                        | 64-bit binary bit-field decomposition, multi-worker fleet, sortability table | Generate ID, inject NTP backward clock skew, flood 12-bit sequence, test UUID  | Twitter Snowflake decomposition, NTP skew refusal, UUIDv4 vs UUIDv7 sorting   |
| **Distributed Txns**     | [`/transactions`](#13-distributed-transactions-2pc-vs-saga-transactions) | 2PC participant swimlane vs Saga forward/reverse LIFO compensation track     | Start 2PC, vote commit/abort, crash coordinator, step Saga, induce failure     | 2PC coordinator crash blocking hazard vs Saga reverse LIFO compensation       |
| **Modular RAG**          | [`/rag`](#14-modular-rag-pipeline-rag)                                   | Hybrid retrieval lanes, rank combiner, reranker card, U-shaped context window | Submit query, toggle RRF combiner, toggle Cross-Encoder, toggle Lost-in-Middle | Lewis et al. 2020, Cormack RRF $k=60$, Liu et al. 2023 Lost-in-the-Middle    |
| **Agent Swarms**         | [`/agents`](#15-autonomous-agent-swarms-agents)                          | Swarm topology graph, ReAct thought bubbles, shared blackboard, message bus  | Dispatch task, cycle topology (Star/Mesh/Ring), crash agent, memory race       | ReAct paradigm (Yao et al. 2022), blackboard concurrency, dead-letter routing |
| **LLM Serving**          | [`/llm-serving`](#16-llm-serving--pagedattention-llm-serving)            | KV page table, GPU block allocation grid, prefill/decode queues, TTFT dials  | Submit prompt, flash crowd burst, preempt request, toggle continuous batching  | vLLM PagedAttention (SOSP '23), 16-token physical blocks, iteration batching  |
| **Vector Database**      | [`/vectordb`](#17-vector-database--hnsw-graphs-vectordb)                 | Multi-layer HNSW graph, skip-list beam traversal, vector distance radar      | Query vector, adjust $efSearch$ beam, insert batch, delete node, toggle IVFPQ  | Malkov & Yashunin HNSW (TPAMI '18), $P=1/\ln(M)$, beam search exploration     |
| **GPU Cluster**          | [`/gpu-cluster`](#18-gpu-cluster--3d-parallelism-gpu-cluster)            | 3D parallelism matrix (TP/PP/DP), NVLink crossbar, 1F1B schedule Gantt chart | Step micro-batch, inject straggler, sever NVLink lane, toggle ZeRO-1/2/3      | Megatron-LM 3D, 1F1B bubble-free schedule, ZeRO optimizer memory partitioning |

---

## Detailed Domain Explanations

### 1. Apache Kafka Visualizer (`/kafka`)

- **Core Concepts:** Log-structured storage, append-only physical segments, consumer group partition assignment, and KRaft metadata quorum leader election.
- **Visual Interface:**
  - Left column: Producer nodes with target topic configuration.
  - Center stage: Broker cards with disk utilization meters, KRaft controller crown, and topic partition cards with live offset watermarks (`HW` and `LEO`).
  - Right column: Active consumer group members with heartbeat countdowns and assigned partition ownership.
  - Animated vector envelope packets traveling along cubic Bezier paths.
- **Chaos & Testing Controls:**
  - Dispatches keyed messages using Kafka's exact Java `Utils.murmur2(key)` hashing algorithm.
  - Simulates single broker crashes (`ALIVE` $\to$ `CRASHED`) and recoveries, showing leader failover and ISR shrink dynamics.
  - Demonstrates cooperative sticky rebalancing as consumers join and leave.
- **Fidelity Highlights:** Enforces KIP-98 sequence number deduplication for idempotent producers and blocks `acks=all` writes when live ISR falls below `min.insync.replicas`.

---

### 2. Raft Consensus Visualizer (`/raft`)

- **Core Concepts:** Replicated state machines, leader election safety, term monotonicity, log matching property, and split-brain prevention under network partitions.
- **Visual Interface:**
  - Circular arrangement of cluster nodes displaying state roles (`Leader`, `Candidate`, `Follower`, `PreCandidate`).
  - Animated heartbeat pulse rings radiating from the leader to followers.
  - Log index and term timeline badges on each node.
  - Red dashed visual barrier representing active network partition boundaries.
- **Chaos & Testing Controls:**
  - **Propose Command:** Commits a log entry across active quorum.
  - **Node Crash & Recovery:** Tests election timer countdowns and leader takeover.
  - **Network Partition:** Isolates arbitrary nodes into minority and majority cliques.
- **Fidelity Highlights:** Implements the Raft Dissertation §9.6 **Pre-Vote phase**, preventing partitioned nodes with stale terms from disrupting a stable leader upon network restoration.

---

### 3. Distributed Database Visualizer (`/database`)

- **Core Concepts:** Consistent hashing with virtual nodes (vnodes), tunable PACELC consistency, vector clocks, hinted handoff, and asynchronous read-repair.
- **Visual Interface:**
  - 32-bit consistent hash ring circle representing token space $[0 \to 2^{32}-1]$.
  - Node ownership markers distributed around the ring.
  - Interactive key hash locator showing exact token coordinate and clockwise replica traversal.
  - Real-time PACELC consistency indicator (Strong: $R + W > N$, Eventual: $R + W \le N$).
- **Chaos & Testing Controls:**
  - **Write & Read Operations:** Configurable per-request consistency (`ONE`, `QUORUM`, `ALL`).
  - **Scale-Out Join:** Adds new physical nodes dynamically, redistributing token ranges without downtime.
  - **Node Crash & Recover:** Spools mutation hints while a replica is down and flushes pending hints on recovery.
- **Fidelity Highlights:**
  - Dual Mode Switch: **Textbook mode** ($N=3$ vnodes, readable node labels) vs. **Realistic mode** ($N=256$ Cassandra vnodes, rendered as micro-dot perimeter density with replica halos).
  - Background read-repair reconciles divergent replicas based on vector clocks.

---

### 4. Redis Cluster Visualizer (`/redis`)

- **Core Concepts:** Distributed hash slot sharding (16,384 slots), CRC16 hashtag hashing (`{user100}:profile`), cluster client redirections, and approximate memory eviction.
- **Visual Interface:**
  - Grid of Redis Master shards and attached Replica nodes.
  - Hash slot allocation bars showing slot ownership ranges (e.g., `0–5460`, `5461–10922`, `10923–16383`).
  - Live memory capacity utilization gauge and eviction policy badge.
- **Chaos & Testing Controls:**
  - **Key Operations:** `SET`, `GET`, and `DEL` with optional TTLs.
  - **Resharding:** Migrates arbitrary slot ranges from one master to another in real time.
  - **Node Failover:** Crashes a master node; replica detects failure via cluster heartbeat and initiates failover.
  - **Eviction Switcher:** Configures policies (`noeviction`, `allkeys-lru`, `volatile-lru`, `allkeys-lfu`, `volatile-lfu`, `volatile-ttl`).
- **Fidelity Highlights:** Explicitly differentiates between transient `-ASK` redirects (slot currently migrating; client executes single request on target without updating route cache) and permanent `-MOVED` redirects (slot fully migrated; client permanently updates slot route cache).

---

### 5. Kubernetes Cluster Scheduler Visualizer (`/kubernetes`)

- **Core Concepts:** Declarative pod scheduling, node resource bin-packing (CPU/Memory), replica reconciliation loops, rolling updates, and PodDisruptionBudgets (PDB).
- **Visual Interface:**
  - Worker node server cards showing allocatable vs. requested CPU millicores and Memory MB.
  - Color-coded pod status blocks (`Pending`, `Running`, `Terminating`, `Evicted`) showing QoS badges (`Guaranteed`, `Burstable`, `BestEffort`).
  - Deployment control panel showing desired vs. actual replicas and rollout strategy.
- **Chaos & Testing Controls:**
  - **Scale Workload:** Dynamically increases or decreases desired replica count.
  - **Rolling Update:** Deploys a new container image with max-surge/max-unavailable parameters.
  - **Node Cordon & Drain:** Marks nodes unschedulable and evicts workloads to remaining nodes.
  - **Node Crash:** Simulates sudden worker loss and automatic pod rescheduling.
- **Fidelity Highlights:** Enforces strict Kubernetes QoS class eviction ordering (evicting `BestEffort` pods before `Burstable` before `Guaranteed`) and blocks node drain requests that violate active `PodDisruptionBudget` `minAvailable` rules.

---

### 6. RabbitMQ AMQP Broker Visualizer (`/rabbitmq`)

- **Core Concepts:** Advanced Message Queuing Protocol (AMQP 0-9-1) routing model, exchange-binding-queue topologies, dead-letter exchanges (DLX), and message priority queues.
- **Visual Interface:**
  - Pipeline canvas connecting Producer Clients $\to$ Exchanges $\to$ Binding Rules $\to$ Queues $\to$ Consumers.
  - Queue depth meters, unacknowledged message counters, and priority distribution heaps.
- **Chaos & Testing Controls:**
  - **Publish:** Sends messages with routing keys and optional message TTLs.
  - **Consumer Acknowledgements:** Triggers `ACK` (success), `NACK` with `requeue=true` (redelivers to queue head), or `REJECT` with `requeue=false` (routes poison message to Dead-Letter Exchange).
- **Fidelity Highlights:** Implements AMQP `x-max-priority` heap queueing (delivering high-priority messages ahead of normal messages) and automatic Dead-Letter Exchange routing on TTL expiration or queue length overflow (`x-max-length`).

---

### 7. Storage Engine Internals Visualizer (`/storage`)

- **Core Concepts:** B+Tree page-based storage (SQLite engine architecture) versus Log-Structured Merge-Tree (RocksDB engine architecture), Write Amplification Factor (WAF), and Bloom filters.
- **Visual Interface:**
  - **B+Tree Mode:** Hierarchical tree canvas displaying internal index nodes and leaf record blocks linked horizontally for range queries, with page split counters.
  - **LSM-Tree Mode:** In-memory MemTable, write-ahead log (WAL), and Leveled SSTables (Level 0, Level 1, Level 2) with active compaction indicators and Bloom filter hit/miss counters.
- **Chaos & Testing Controls:**
  - **Write & Read Records:** Inserts integer keys and inspects on-disk vs in-memory retrieval paths.
  - **Flush & Compaction:** Manually flushes MemTable to L0 SSTables or triggers leveled merges into L1/L2.
  - **Fidelity Switcher:**
    - **Textbook Mode:** B+Tree Order $M=4$ for visual clarity.
    - **Realistic Mode:** B+Tree Order $M \approx 170$ derived from 4096-byte page size, and dynamic Bloom filter false-positive rate $p \approx (1 - e^{-kn/m})^k$ that degrades as item count $n$ increases.
- **Fidelity Highlights:** Displays real-time Write Amplification Factor (WAF $= \text{physical bytes written} / \text{logical bytes written}$) demonstrating the write-heavy advantage of LSM-trees over in-place B+Tree page updates.

---

### 8. TCP Networking & Congestion Control Visualizer (`/networking`)

- **Core Concepts:** TCP connection state machine, 3-way handshake, 4-way teardown, sliding window flow control, SACK blocks, and congestion control algorithms (Reno vs. CUBIC).
- **Visual Interface:**
  - Full-duplex connection rail showing Client $\leftrightarrow$ Server state badges (`SYN_SENT`, `ESTABLISHED`, `FIN_WAIT`, `TIME_WAIT`).
  - Sliding window buffer slot visualization (`SentAndAcked`, `SentUnacked`, `UsableNotSent`, `NotUsable`).
  - Real-time Congestion Window ($cwnd$) timeline line graph displaying slow-start exponential curves and congestion avoidance phases.
- **Chaos & Testing Controls:**
  - **Start Handshake:** Initiates SYN $\to$ SYN-ACK $\to$ ACK.
  - **Send Data:** Transmits payload bytes through the sliding window.
  - **Drop Packet:** Drops in-flight packets to trigger congestion response.
  - **Fidelity Switcher:**
    - **Reno Mode:** Classic AIMD linear increase (+1 MSS/RTT) and 0.5× multiplicative decrease ($ssthresh = cwnd / 2$).
    - **CUBIC Mode:** Linux kernel default cubic polynomial growth curve $W_{cubic}(t) = C(t-K)^3 + W_{max}$ with $\beta_{cubic} = 0.7$ decrease factor.
- **Fidelity Highlights:**
  - Implements RFC 6298 Retransmission Timeout (RTO) computation with granularity clamp $G \ge 1\text{ tick}$.
  - Enforces the mode-aware `NET-3` invariant asserting exact decrease multipliers for Reno (0.5×) versus CUBIC (0.7×).

---

### 9. Rate Limiter Algorithms Visualizer (`/rate-limiter`)

- **Core Concepts:** Traffic shaping, admission control, burst tolerance, sliding time windows, and distributed multiplier defects.
- **Visual Interface:**
  - 5-way comparative dashboard showing:
    1. **Token Bucket** (RFC 2697 srTCM) with animated liquid token fill level and burst drain meter.
    2. **Leaky Bucket** with FIFO drop-tail queue buffer and continuous deterministic leak rate.
    3. **Fixed Window Counter** with integer limit meter and discrete epoch boundary resets.
    4. **Sliding Window Log** with timestamp timeline scatter-plot and eviction watermarks.
    5. **Sliding Window Counter** (Cloudflare approximation) displaying current vs. previous window weight interpolation.
- **Chaos & Testing Controls:**
  - **Single Request & Burst:** Dispatches instantaneous bursts of $N$ requests to test drop-tail vs queueing behavior.
  - **Boundary Burst Trigger:** Fires $2\times$ the configured limit across the exact sub-millisecond boundary between two adjacent fixed windows.
  - **Backend Switcher:** Toggles between shared Redis state and local in-memory state with $N$ independent node replicas.
- **Fidelity Highlights:**
  - Demonstrates the classic Fixed Window boundary burst vulnerability ($2\times$ rate admitted within a rolling window).
  - Demonstrates the local-memory cluster multiplier bug ($N\times$ throughput admitted when $N$ stateless servers maintain unshared local counters).
  - Invariants: `RL-1` (Token Bucket Capacity Clamp), `RL-2` (Leaky Bucket Leak Monotonicity), `RL-3` (Sliding Log Window Exactness), `RL-4` (Local Memory Multiplier Invariant).

---

### 10. Distributed Lock Manager Visualizer (`/distributed-lock`)

- **Core Concepts:** Redlock multi-node consensus quorum, lease TTL countdowns, monotonic fencing tokens, and Martin Kleppmann's GC pause hazard critique.
- **Visual Interface:**
  - 5-node Redlock quorum grid showing independent Redis master locks and active lease expiry bars.
  - Monotonic fencing token ledger tracking incremented sequence values.
  - Storage node inspection panel verifying whether incoming client writes are accepted or rejected based on fencing tokens.
- **Chaos & Testing Controls:**
  - **Acquire & Release Lock:** Requests quorum grant across the 5 nodes ($\ge 3$ nodes required).
  - **Inject GC Pause:** Freezes Client A for an arbitrary duration, allowing its lock lease to expire mid-flight.
  - **Acquire Competing Lock:** Client B acquires the expired lock and receives a higher fencing token.
  - **Write Protected Storage:** Client A wakes up from GC pause and attempts to execute its pending write; storage validates fencing token monotonicity.
  - **Toggle Fencing Tokens:** Demonstrates silent storage corruption when fencing tokens are omitted versus safe rejection when fencing tokens are enabled.
  - **Partition Nodes:** Simulates minority network partitions and clock drift.
- **Fidelity Highlights:**
  - Directly models the Martin Kleppmann vs. Salvatore Sanfilippo Redlock critique (2016).
  - Invariants: `LOCK-1` (Mutual Exclusion under Quorum), `LOCK-2` (Lease Expiry Monotonicity), `LOCK-3` (Fencing Token Monotonicity on Protected Resource), `LOCK-4` (Kleppmann GC Pause Hazard Flag).

---

### 11. CDN & Multi-Tier Caching Visualizer (`/cdn-cache`)

- **Core Concepts:** Hierarchical HTTP caching (RFC 9111), Anycast Edge PoPs, Regional shield tiers, origin request coalescing (single-flight / thundering herd mitigation), and cache purge waves.
- **Visual Interface:**
  - Hierarchical multi-tier waterfall: Edge PoP fleet (`US_EAST`, `US_WEST`, `EU_WEST`, `AP_SOUTH`) $\to$ Regional tiers (`US`, `EU`, `AP`) $\to$ Origin Server.
  - Per-tier cache state: Hit ratio meters, TTL countdowns, and active in-flight request tallies.
  - Origin load spikes radar.
- **Chaos & Testing Controls:**
  - **Client Request:** Dispatches HTTP GET requests from specified geographic regions.
  - **Flash Crowd Stampede:** Simulates 1,000 concurrent requests arriving for an uncached asset in the same millisecond.
  - **Toggle Request Coalescing:** Compares origin request volume with single-flight mutex coalescing enabled (1 origin fetch) versus disabled (1,000 parallel origin fetches crashing origin).
  - **Purge Asset:** Broadcasts instantaneous soft-purge or hard-purge waves across the global PoP fleet.
  - **Update Origin:** Modifies the authoritative origin object with new ETags and `max-age` directives.
- **Fidelity Highlights:**
  - Strict RFC 9111 HTTP caching headers (`max-age`, `s-maxage`, `stale-while-revalidate`).
  - Invariants: `CDN-1` (Cache TTL Expiry Monotonicity), `CDN-2` (Origin Coalescing Thundering Herd Prevention), `CDN-3` (Purge Propagation Completeness), `CDN-4` (Stale-While-Revalidate Window Boundedness).

---

### 12. Distributed ID Generation Visualizer (`/id-gen`)

- **Core Concepts:** 64-bit Twitter Snowflake decomposition, monotonic time-sortable IDs, UUIDv4 vs. UUIDv7 B+Tree index fragmentation, and NTP backward clock skew recovery.
- **Visual Interface:**
  - 64-bit binary bit-field breakdown panel: 1-bit sign, 41-bit timestamp delta ($69\text{ years}$ lifetime), 10-bit worker ID ($1024\text{ nodes}$), 12-bit sequence counter ($4096\text{ IDs/ms/node}$).
  - Worker node cluster cards showing live millisecond timestamps, sequence state, and drift offsets.
  - Sortability comparison table: Chronological creation order vs Lexicographical sort order (highlighting random UUIDv4 database page splits vs monotonic UUIDv7/Snowflake append efficiency).
- **Chaos & Testing Controls:**
  - **Generate IDs:** Fires single or batched generation requests on specific workers.
  - **Inject Backward Clock Skew:** Rewinds worker clock by $50\text{ms}$ to test NTP backward regression defense.
  - **Flood 12-bit Sequence:** Fires $> 4096$ requests within the exact same millisecond to demonstrate sequence exhaustion and millisecond spin-wait rollover.
  - **Assign Duplicate Worker ID:** Forces two active generator nodes to share the same worker ID, detecting collision hazards.
- **Fidelity Highlights:**
  - Exact 64-bit BigInt bitwise arithmetic matching Twitter Snowflake specification.
  - Rejects ID generation or pauses clock when NTP regression exceeds safety thresholds.
  - Invariants: `ID-1` (Global Uniqueness & No Collisions), `ID-2` (Strict Monotonicity Within Single Worker), `ID-3` (Backward Clock Regression Refusal), `ID-4` (Sequence Overflow Protection).

---

### 13. Distributed Transactions (2PC vs. Saga) Visualizer (`/transactions`)

- **Core Concepts:** Atomic distributed commit, Two-Phase Commit (2PC) protocol, coordinator crash blocking hazard, and Saga orchestration with compensating transactions.
- **Visual Interface:**
  - Dual-paradigm switcher:
    1. **Two-Phase Commit (2PC):** Coordinator swimlane + 3 participant database cards (`Payments`, `Inventory`, `Shipping`). Visualizes `Prepare`, `Vote`, `Commit`, `Abort` message envelopes and local resource locks.
    2. **Saga Pattern:** Orchestrator state machine with forward transaction pipeline $\to$ step-by-step progress $\to$ reverse compensating transaction stack.
- **Chaos & Testing Controls:**
  - **Two-Phase Commit Mode:**
    - Initiate 2PC transaction: Coordinator broadcasts `Prepare` to all participants.
    - Vote Participant: Individual participants cast `VOTE_COMMIT` or `VOTE_ABORT`.
    - Crash Coordinator: Injects coordinator failure immediately after `Prepare` votes are received, stranding all participants in `BLOCKED_UNCERTAIN` state holding resource locks indefinitely.
    - Recover Coordinator: Replays WAL to resolve stranded participants.
  - **Saga Orchestration Mode:**
    - Step through forward transactions (`OrderCreated` $\to$ `PaymentReserved` $\to$ `InventoryDeducted` $\to$ `DeliveryScheduled`).
    - Inject Step Failure: Induces failure at Step 3 (`InventoryOut`); triggers reverse LIFO compensating transactions (`RefundPayment`, `CancelOrder`) to restore eventual consistency without blocking locks.
- **Fidelity Highlights:**
  - Visually demonstrates why modern microservice architectures replace blocking 2PC with event-driven Sagas for distributed workflows across independent database boundaries.
  - Invariants: `TXN-1` (2PC Atomic Consistency), `TXN-2` (2PC Coordinator Crash Blocking Hazard Flag), `TXN-3` (Saga Reverse LIFO Compensation Ordering), `TXN-4` (Saga Eventual Consistency Closure).

---

### 14. Modular RAG Pipeline (`/rag`)

- **Core Concepts:** Hybrid retrieval architectures, Reciprocal Rank Fusion (RRF $k=60$), Cross-Encoder neural reranking, token budget packing, and "Lost-in-the-Middle" attention degradation prevention.
- **Visual Interface:**
  - Parallel dual-lane retrieval columns: Sparse BM25 lexical keyword matching vs Dense vector cosine similarity search.
  - Interactive RRF rank combiner card displaying computed candidate score weights ($RRF(d) = \sum \frac{1}{k + r(d)}$).
  - Cross-Encoder deep neural reranker stage showing semantic relevance scoring.
  - Final Context Window Inspector: Visualizes U-shaped token ordering (placing high-relevance chunks at the top and bottom edges of the context prompt while burying lower-relevance chunks in the middle).
- **Chaos & Testing Controls:**
  - **Submit Query:** Dispatches test queries through lexical and dense retrieval stages.
  - **Toggle RRF Rank Combiner:** Toggles between hybrid reciprocal rank fusion versus single-stage retrieval.
  - **Toggle Cross-Encoder Reranker:** Enables or bypasses the secondary compute-heavy neural reranking stage.
  - **Toggle Lost-in-the-Middle U-Shape:** Toggles chronological chunk concatenation versus U-shaped positional optimization.
  - **Trigger Out-of-Vocabulary / Dense Drift:** Injects out-of-distribution technical jargon or semantic drift to demonstrate hybrid retrieval resilience.
- **Fidelity Highlights:**
  - Grounded in Lewis et al. (2020) RAG foundation, Cormack et al. (2009) RRF algorithm with standard $k=60$ constant, and Liu et al. (2023) attention distribution findings.
  - Invariants: `RAG-1` (Retrieval Score Monotonicity), `RAG-2` (Context Budget Preservation), `RAG-3` (RRF Rank Bounds), `RAG-4` (U-Shape Positional Integrity).

---

### 15. Autonomous Agent Swarms (`/agents`)

- **Core Concepts:** Multi-agent autonomous collaboration, Reasoning + Acting (ReAct) paradigm, topology routing (Star / Mesh / Hierarchical / Ring), shared blackboard state coordination, and dead-letter fault containment.
- **Visual Interface:**
  - Dynamic force-directed swarm graph rendering interconnected agent cards (`Coordinator`, `Researcher`, `Coder`, `Critic`).
  - Per-agent status tags (`IDLE`, `THINKING`, `ACTING`, `AWAITING_TOOL`, `ERROR`) with animated thought bubble streams.
  - Shared Blackboard state inspector showing memory slot versions and concurrent read/write locks.
  - Dead-Letter Routing Queue displaying isolated or timed-out task payloads.
- **Chaos & Testing Controls:**
  - **Dispatch Complex Task:** Sends structured multi-step objectives requiring multi-agent delegation.
  - **Cycle Topology:** Dynamically switches communication structures between Star (central orchestrator), Mesh (peer-to-peer), Hierarchical (manager-worker tree), and Ring (token passing).
  - **Crash / Hang Agent:** Induces synthetic worker death or infinite tool-call loops to verify supervisor timeout detection and dead-letter failover.
  - **Simulate Blackboard Memory Race:** Injects concurrent unsynchronized writes across multiple workers to demonstrate optimistic locking rollbacks.
- **Fidelity Highlights:**
  - Implements the Yao et al. (2022) ReAct thought-action-observation cycle and modern multi-agent coordinator-worker patterns (AutoGPT / CrewAI / LangGraph).
  - Invariants: `AGENTS-1` (Acyclic Execution DAG), `AGENTS-2` (Blackboard Optimistic Locking Concurrency), `AGENTS-3` (Dead-Letter Routing Isolation), `AGENTS-4` (ReAct Tool Call Bounded Retries).

---

### 16. LLM Serving & PagedAttention (`/llm-serving`)

- **Core Concepts:** High-throughput Large Language Model inference, virtual memory Key-Value (KV) cache management (PagedAttention), continuous iteration batching (Orca), prefill vs. decode phase dynamics, and memory preemption.
- **Visual Interface:**
  - Logical-to-Physical KV Page Table: Maps per-sequence logical token sequences to 16-token physical GPU memory blocks.
  - Physical GPU Memory Block Matrix: Color-coded memory grid displaying active, free, and shared prefix blocks.
  - Dual-Phase Inference Queue: Parallel Prefill lane (compute-bound matrix multiplies) and Decode lane (memory-bandwidth-bound token stepping).
  - Real-time performance dials: Time-to-First-Token (TTFT), Inter-Token Latency (ITL), and GPU memory fragmentation percentage.
- **Chaos & Testing Controls:**
  - **Submit Prompt:** Dispatches new inference requests with variable context lengths and output generation limits.
  - **Flash Crowd Burst:** Fires 50 simultaneous long-context requests to push KV memory past 100% capacity.
  - **Preempt Request:** Triggers KV cache eviction and recomputation under memory pressure.
  - **Toggle Continuous Iteration Batching:** Compares rigid static batching (where fast requests are held hostage by long requests) against continuous iteration-level scheduling.
- **Fidelity Highlights:**
  - Directly models the Kwon et al. (SOSP 2023) vLLM PagedAttention virtual memory architecture and Yu et al. (OSDI 2022) Orca continuous batching scheduler.
  - Invariants: `LLM-1` (KV Block Table Mapping Integrity), `LLM-2` (Zero Physical Memory Over-Allocation), `LLM-3` (Continuous Batching Fairness), `LLM-4` (Preemption Recomputation Correctness).

---

### 17. Vector Database & HNSW Graphs (`/vectordb`)

- **Core Concepts:** Approximate Nearest Neighbor (ANN) search, Hierarchical Navigable Small World (HNSW) multi-layer graphs, logarithmic skip-list traversal, beam search pruning ($efSearch$), and vector quantization (IVFPQ).
- **Visual Interface:**
  - 3D-stacked multi-layer HNSW graph: Visualizes sparser upper layers (long-range highway connections) down to Layer 0 (dense local neighborhood clusters).
  - Live Query Beam Traversal: Animated search path showing current entry point, candidate priority queue, dynamic evaluation perimeter ($efSearch$), and visited nodes.
  - Quantization distortion panel: Compares uncompressed 768-dimensional float32 vectors against compressed Product Quantization (PQ) centroids and memory footprints.
- **Chaos & Testing Controls:**
  - **Query Vector:** Executes nearest neighbor search with live step-by-step beam expansion.
  - **Adjust $efSearch$ Slider:** Balances query recall accuracy (high $efSearch$) against latency / distance evaluations (low $efSearch$).
  - **Batch Insert:** Dynamically constructs HNSW links using the probability distribution $P(l) = 1 / \ln(M)$ and $M_{max}$ neighbor pruning heuristics.
  - **Delete Vector Node:** Tests soft-deletion versus graph reconnection to prevent disjoint island partitions.
  - **Toggle IVFPQ Quantization:** Compares exact brute-force Euclidean distance against quantized codebook approximations.
- **Fidelity Highlights:**
  - Faithfully adheres to the Malkov & Yashunin (IEEE TPAMI 2018) HNSW specification and Faiss indexing benchmarks.
  - Invariants: `VDB-1` (Monotonic Distance Improvement in Beam Search), `VDB-2` (Layer 0 Graph Connectedness & No Disjoint Islands), `VDB-3` (Max Neighbor Bound $M$), `VDB-4` (Quantization Error Boundedness).

---

### 18. GPU Cluster & 3D Parallelism (`/gpu-cluster`)

- **Core Concepts:** Distributed deep learning training, 3D parallelism matrix (Tensor Parallelism [TP] + Pipeline Parallelism [PP] + Data Parallelism [DP]), ZeRO memory partitioning (ZeRO-1/2/3), NVLink vs. InfiniBand network topology, and 1F1B schedule execution.
- **Visual Interface:**
  - 3D Parallelism Node Matrix: 8-GPU or 16-GPU cluster cards color-coded by TP intra-node rank, PP pipeline stage, and DP replication group.
  - Interconnect Topology Diagram: High-bandwidth NVLink intra-node crossbars ($900\text{ GB/s}$) vs inter-node InfiniBand RDMA links ($400\text{ Gbps}$).
  - Pipeline Execution Gantt Chart: Interactive 1F1B (One-Forward-One-Backward) micro-batch schedule highlighting forward passes, backward passes, activation stashing, and pipeline bubble idle time.
  - Memory Breakdown Radar: Displays weights, gradients, optimizer states, and activation memory per GPU under ZeRO stages.
- **Chaos & Testing Controls:**
  - **Step Micro-Batch:** Steps through forward and backward micro-batch evaluations across the pipeline stages.
  - **Inject Straggler GPU:** Slows down a single GPU by $300\text{ms}$ to demonstrate pipeline bubble propagation and all-reduce synchronization stalls.
  - **Sever NVLink Lane:** Injects link degradation forcing TP communication over high-latency fallback PCIe/host paths.
  - **Toggle ZeRO Stage (0/1/2/3):** Demonstrates memory footprint reduction from standard replication (ZeRO-0) to optimizer state partitioning (ZeRO-1), gradient partitioning (ZeRO-2), and parameter partitioning (ZeRO-3).
- **Fidelity Highlights:**
  - Modeled on Megatron-LM (Shoeybi et al. 2019), Narayanan et al. (SOSP 2021) 1F1B pipeline schedule, and Rajbhandari et al. (SC 2020) DeepSpeed ZeRO memory optimizations.
  - Invariants: `GPU-1` (Pipeline Bubble Conservation), `GPU-2` (3D Tensor Dimension Product Consistency: $TP \times PP \times DP = N_{gpus}$), `GPU-3` (ZeRO Memory Partition Conservation), `GPU-4` (All-Reduce Gradient Synchronization Convergence).

---

## Platform Workflows & Architecture

TheVisualizer is engineered as a unified, production-grade learning and interview preparation platform:

1. **Global Command Palette (`Cmd+K` / `Ctrl+K`):** Instantly search, jump between, and execute actions across all 18 distributed systems and AI infrastructure domains.
2. **Interview Prep Mode:** Built-in system design interview prep panels featuring real-world interview prompts, architectural trade-off checklists, capacity calculation calculators, and failure mode drills.
3. **Composite Pipelines:** Seamless multi-domain scenarios (e.g., End-to-end RAG to VectorDB to LLM Serving; Kafka to Redis to Kubernetes) demonstrating cross-system distributed topologies.
4. **Deterministic Virtual Timeline:** Built on a seeded pseudo-random number generator (SplitMix32) and discrete event queue. The exact same scenario inputs produce identical execution traces across any browser or server.
5. **State Permalinks & Export:** Share any live simulation state, chaos scenario, or multi-node cluster topology via URL permalinks (`?p=...`) or portable `.json` scenario trace files.
6. **Hardware-Accelerated 60 FPS Telemetry HUD:** High-density canvas rendering utilizing offscreen buffers, spatial viewport culling, zero garbage-collection overhead, and real-time frame duration telemetry ($< 0.1\text{ms}$ mean render cost).
7. **Hard Invariant Halting:** Reducers execute domain invariant checkers on every step. Any violation immediately pauses playback, highlights the offending components, and captures a forensic snapshot.

