# TheVisualizer: 13-Domain Distributed Systems Feature Explainer

**TheVisualizer** is an interactive, deterministic, real-time simulation and visualization platform for distributed systems, storage engines, transport protocols, and system design interview architectures. Every visualizer in this monorepo is accessible via its own unique, direct routing endpoint (`/[domain]`), backed by a zero-I/O Deterministic Discrete-Event Simulation (DDES) engine, real-world protocol invariants, and interactive chaos injection controls.

---

## Visualizer Navigation Matrix

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

## Technical Foundations

1. **Deterministic Virtual Timeline:** Built on seeded pseudo-random number generator (SplitMix32) and discrete event queue. The exact same scenario inputs produce identical execution traces across any browser or server.
2. **Hard Invariant Halting:** Reducers execute domain invariant checkers on every step. Any violation immediately pauses playback and captures a forensic snapshot.
3. **Trace Replay Scrubber:** Simulation runs can be paused, scrubbed tick-by-tick, exported to `.json` trace files, and reloaded offline.
