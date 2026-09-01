# TheVisualizer: Comprehensive Visualizer Specifications & Technical Reference

This document provides a technical reference for all **8 distributed system simulation engines and visualizers** implemented in **TheVisualizer** platform. It details the underlying mathematical and protocol models, verified invariants, visual canvas representations, chaos capabilities, and roadmap enhancement vectors.

---

## 1. Platform Architecture & Simulation Foundations

The platform is designed around **Deterministic Discrete-Event Simulation (DDES)** with zero runtime I/O dependencies inside `@the-visualizer/simulation`.

```
                      ┌──────────────────────────────────────────────┐
                      │            @the-visualizer/web               │
                      │    (Next.js 15 React Canvas UI + WebSockets)  │
                      └──────────────────────┬───────────────────────┘
                                             │
                       ┌─────────────────────┴─────────────────────┐
                       ▼                                           ▼
          [Live WebSocket Tunnel]                     [In-Browser Client Sandbox]
          ws-gateway (Node Worker)                    Client-Side Pure Transition Loop
                       │                                           │
                       └─────────────────────┬─────────────────────┘
                                             │
                                             ▼
                      ┌──────────────────────────────────────────────┐
                      │         @the-visualizer/simulation           │
                      │ ├─ VirtualTimeline & MinHeap PriorityQueue   │
                      │ ├─ DeterministicRNG (xoshiro128+ PRNG)       │
                      │ ├─ Pure State Reducers (S_t+1 = f(S_t, E))   │
                      │ ├─ Continuous Invariant Verifiers            │
                      │ └─ Oracle Harness & Trace Reconstitutor      │
                      └──────────────────────────────────────────────┘
```

### Core Invariant & Determinism Guarantees
1. **Pure Reducer Functions**: Given identical initial state $S_0$, event sequence $E_{0\dots n}$, and RNG seed $K$, the final state $S_n$ and emitted events are bit-for-bit identical across Node.js servers, Web Workers, and browser tabs.
2. **Hard Invariant Halting**: Every domain runs dedicated assertion rules on every tick. Any safety or liveness violation immediately halts the simulation, surfaces the exact rule ID, and captures a reproducible snapshot.
3. **Time-Travel Scrubbing**: Full state histories are recorded as append-only immutable frames allowing forward/backward scrubber playback, 1x/2x/4x animated replays, and offline JSON trace export/import.

---

## 2. Comprehensive Domain Visualizer Specifications

---

### Domain 1: Apache Kafka & KRaft Consensus (`/kafka`)

#### Protocol & Reference Model
- **Reference Standard**: Apache Kafka 4.0+ (KRaft metadata mode, consumer group rebalance protocol, Murmur2 partition hashing).
- **Core State Model**:
  - `brokers`: Cluster nodes with CPU/disk metrics, rack locality, and lifecycle states (`ALIVE`, `DEGRADED`, `CRASHED`, `RECOVERING`).
  - `topics`: Partition maps with assigned replicas, in-sync replicas (ISR), high watermarks (HW), and log end offsets (LEO).
  - `kraft`: Metadata quorum term, active leader controller, voter metadata log, and epoch numbers.
  - `consumerGroups`: Group coordinator broker, member assignments, partition revocations, and generation IDs.

#### Verified Invariants
- `INV-1`: **Partition Leader Liveness**: If `leaderBrokerId` is defined, the target broker must exist in the cluster and have status `ALIVE`.
- `INV-2`: **ISR Leader Membership**: The partition leader must always be a member of the In-Sync Replicas (ISR) set.
- `INV-3`: **Monotonic High Watermark**: High watermark $\le$ Log End Offset for every partition.
- `INV-4`: **Single Active Controller**: Exactly one broker may hold the active KRaft controller role in any given metadata epoch.
- `INV-5`: **Consumer Partition Exclusivity**: Within a consumer group, no partition is concurrently assigned to more than one active consumer.

#### Visual Canvas Mechanics
- **Brokers & Partitions**: Rendered with live disk usage rings, ISR health badges, and leader crowns.
- **Message Particles**: Real-time bezier curve packet animations traversing from producers $\to$ brokers $\to$ consumer group subscribers.
- **Playback Scrubber**: Scrub backwards through thousands of cluster ticks; export/import JSON traces.

#### Chaos & Interactive Controls
- **Inject Broker Crash / Recovery**: Force-kill partition leaders to observe ISR election and metadata epoch advancement.
- **Producer / Consumer Nodes**: Dynamically attach producers with auto-produce cadence (0.5s–30.0s), adjust topic bindings, and observe rebalances.

---

### Domain 2: Raft Consensus Engine (`/raft`)

#### Protocol & Reference Model
- **Reference Standard**: Ongaro & Ousterhout Raft Consensus Algorithm.
- **Core State Model**:
  - `nodes`: 5-node cluster state machines (`FOLLOWER`, `CANDIDATE`, `LEADER`).
  - `currentTerm`: Monotonically increasing election epoch.
  - `votedFor`: Candidate ID voted for in current term.
  - `log`: Append-only entries with index, term, command payload, and commit status.
  - `commitIndex` & `lastApplied`: Highest log entry known to be committed by quorum.

#### Verified Invariants
- `RAFT-1`: **Election Safety**: At most one leader can be elected per term.
- `RAFT-2`: **Leader Append-Only**: A leader never overwrites or truncates its own log entries.
- `RAFT-3`: **Log Matching Property**: If two logs contain an entry with the same index and term, the logs are identical in all entries up to the given index.
- `RAFT-4`: **Leader Completeness**: If a log entry is committed in a given term, that entry will be present in the logs of the leaders for all higher-numbered terms.

#### Visual Canvas Mechanics
- **Node Circle Topography**: Visual node cluster displaying current roles, terms, and election countdown progress timers.
- **Live Log Timeline Matrix**: Side-by-side log comparison across all 5 nodes showing committed (green) vs uncommitted (amber) entries.
- **Heartbeat & RPC Waves**: Radial pulses showing `RequestVote` and `AppendEntries` messages across network links.

#### Chaos & Interactive Controls
- **Client Propose**: Submit arbitrary state machine commands (`SET key value`).
- **Trigger Election Timeout**: Force candidate transition and vote tallying.
- **Isolate / Partition Node**: Create network split-brains to visualize minority vs majority quorum partitions.

---

### Domain 3: Distributed Database & Consistent Hashing (`/database`)

#### Protocol & Reference Model
- **Reference Standard**: Amazon Dynamo / Apache Cassandra token ring architecture.
- **Core State Model**:
  - `nodes`: Database nodes positioned on a 360° MD5 / SHA-1 token ring with virtual nodes (vnodes).
  - `replicationFactor`: Number of replica nodes assigned clockwise along the token ring.
  - `consistencyLevel`: Client read/write consistency requirements (`ONE`, `QUORUM`, `ALL`).
  - `storage`: Key-value records with monotonic version numbers and replica replica acknowledgment sets.

#### Verified Invariants
- `DB-1`: **Consistent Token Ordering**: Node tokens on the hash ring must be strictly ordered from $0^\circ$ to $359^\circ$.
- `DB-2`: **Quorum Overlap (R + W > N)**: Strong consistency holds when Read Quorum + Write Quorum $>$ Replication Factor.
- `DB-3`: **Replica Distinctness**: A partition key's $N$ replicas must map to distinct physical nodes.

#### Visual Canvas Mechanics
- **Circular Token Ring Canvas**: 360° ring displaying physical nodes, vnode distribution, and partition token arcs.
- **Key Hashing Arcs**: Key lookup hashing point plotted on the ring with visual ray traces to replica nodes.
- **Consistency Level Matrix**: Visual indicators comparing acknowledgment counts against `ONE`, `QUORUM`, and `ALL`.

#### Chaos & Interactive Controls
- **Execute Read / Write**: Submit keys and values under selectable consistency levels (`ONE`, `QUORUM`, `ALL`).
- **Add / Remove Storage Nodes**: Observe automatic vnode rebalancing and token ownership handoff.
- **Node Failures & Split-Quorums**: Simulate replica dropouts to demonstrate read repair and stale reads under weak consistency.

---

### Domain 4: Redis Cluster & Memory Eviction (`/redis`)

#### Protocol & Reference Model
- **Reference Standard**: Redis Cluster Specification (16,384 CRC16 Hash Slots) and Redis memory eviction engine.
- **Core State Model**:
  - `slots`: Distribution of 16,384 slots across master and replica nodes (`HASH_SLOT = CRC16(key) mod 16384`).
  - `maxMemoryBytes` & `currentMemoryBytes`: Memory tracking against configurable limits.
  - `evictionPolicy`: `NO_EVICTION`, `ALLKEYS_LRU`, `VOLATILE_LRU`, `ALLKEYS_LFU`, `VOLATILE_TTL`, `ALLKEYS_RANDOM`.
  - `keys`: Stored keys with access timestamps, access counters, and TTL expirations.

#### Verified Invariants
- `REDIS-1`: **Full Slot Coverage**: The union of slots across all master nodes must exactly equal $0\dots 16383$.
- `REDIS-2`: **Disjoint Slot Ownership**: No slot can be assigned to multiple master nodes simultaneously.
- `REDIS-3`: **Memory Ceiling Enforcement**: Under active eviction policies, memory usage must not exceed `maxMemoryBytes`.

#### Visual Canvas Mechanics
- **Hash Slot Distribution Bar**: Colored segment bar mapping all 16,384 slots across cluster nodes.
- **Memory Pressure Gauge**: Live memory consumption bar with threshold warnings and eviction counters.
- **Key Eviction Pipeline**: Visual queue showing LRU/LFU candidates being evicted under memory pressure.

#### Chaos & Interactive Controls
- **SET / GET / DEL with TTL**: Insert keys with expiration timeouts.
- **Switch Eviction Policies**: Toggle between LRU, LFU, Random, and TTL policies on the fly.
- **Slot Migration**: Move slot ranges between masters to visualize live resharding.

---

### Domain 5: Kubernetes Reconciliation & Scheduling (`/kubernetes`)

#### Protocol & Reference Model
- **Reference Standard**: Kubernetes `controller-runtime` and `kube-scheduler` architecture.
- **Core State Model**:
  - `nodes`: Worker nodes with CPU/memory capacity, allocatable resources, and node taints/labels.
  - `deployments`: Desired replicas, selector labels, update strategies, and rolling update progress.
  - `pods`: Pod phases (`Pending`, `Running`, `Succeeded`, `Failed`, `CrashLoopBackOff`), restart counts, and node bindings.
  - `reconcileQueue`: FIFO reconciliation queue processing desired vs observed state loops.

#### Verified Invariants
- `K8S-1`: **Resource Non-Overcommit**: Sum of Pod CPU/Memory requests on a node cannot exceed node allocatable capacity.
- `K8S-2`: **Replica Convergence**: For any healthy deployment, observed running pods converge to desired replicas.
- `K8S-3`: **Pod Node Exclusivity**: A running pod must be bound to exactly one active worker node.

#### Visual Canvas Mechanics
- **Node Capacity Racks**: Visual node racks with CPU/Memory slot meters and hosted Pod blocks.
- **Reconciliation Engine Pulse**: Animated control loop showing Level-Triggered reconciliation cycle (`Observe` $\to$ `Analyze` $\to$ `Act`).
- **Pod Lifecycle Badges**: Pod status indicators transitioning across Pending, Running, Terminating, and CrashLoopBackOff.

#### Chaos & Interactive Controls
- **Scale Deployment**: Scale replica counts up/down to watch parallel scheduling and graceful termination.
- **Cordon / Drain Node**: Cordon nodes to trigger eviction and automated pod rescheduling onto remaining nodes.
- **Inject Pod Crash**: Induce container crashes to trigger CrashLoopBackOff exponential backoff timers.

---

### Domain 6: RabbitMQ & AMQP 0-9-1 Messaging (`/rabbitmq`)

#### Protocol & Reference Model
- **Reference Standard**: AMQP 0-9-1 Specification (Exchanges, Queues, Bindings, Routing Keys, Acks/Nacks, DLX).
- **Core State Model**:
  - `exchanges`: `DIRECT`, `FANOUT`, `TOPIC`, `HEADERS` message routers.
  - `queues`: FIFO message queues with message count, consumer subscriptions, and Dead-Letter Exchange (DLX) bindings.
  - `bindings`: Routing rules connecting exchanges to queues with routing keys and wildcard topic patterns (`*`, `#`).
  - `messages`: AMQP delivery envelopes with payload, correlation ID, delivery tag, and redelivery attempts.

#### Verified Invariants
- `RABBIT-1`: **Exchange Routing Completeness**: Unroutable messages without alternate exchanges are discarded or returned.
- `RABBIT-2`: **FIFO Queue Ordering**: Messages within a single queue preserve FIFO enqueue order.
- `RABBIT-3`: **Dead-Letter Routing**: Rejected or expired messages with configured DLX are routed to the DLQ.

#### Visual Canvas Mechanics
- **AMQP Topology Pipeline**: Visual topology graph showing Exchange $\to$ Binding Keys $\to$ Queues $\to$ Consumers.
- **Wildcard Topic Matcher**: Visual inspection showing how `order.*.europe` matches `order.created.europe` vs `order.#`.
- **Dead-Letter Queue Bin**: Dedicated DLQ view showing poison messages and rejection causes.

#### Chaos & Interactive Controls
- **Publish AMQP Message**: Publish to Direct, Fanout, or Topic exchanges with custom routing keys.
- **Ack / Nack / Reject**: Acknowledge deliveries, negative acknowledge with requeue, or reject poison messages to DLX.
- **Bind / Unbind Queues**: Dynamically reconfigure broker routing topology in real-time.

---

### Domain 7: Storage Engine Internals (`/storage`)

#### Protocol & Reference Model
- **Dual Reference Standard**:
  1. **B+ Tree Index (SQLite / Postgres model)**: Balanced $M$-way search tree with order $M=4$, leaf node linked lists, page splits, and parent key promotion.
  2. **LSM-Tree (RocksDB / LevelDB model)**: Append-only Write-Ahead Log (WAL), in-memory MemTable, 16-bit Bloom filter bitset generation, Level 0 SSTable flushes, and Leveled Compaction merge runs.
- **Core State Model**:
  - `btree`: Root node pointer, internal routing pages, leaf key-value data pages, and traversal search paths.
  - `lsm`: Active MemTable, WAL log entries, multi-level SSTables (Level 0, Level 1, Level 2), Bloom filter bitsets, and compaction merges.

#### Verified Invariants
- `STORAGE-1`: **B+ Tree Key Ordering & Balance**: All keys in child nodes fall strictly between parent separator keys; all leaf pages are at identical depth.
- `STORAGE-2`: **B+ Tree Node Capacity**: Every non-root node contains between $\lceil M/2 \rceil$ and $M$ keys.
- `STORAGE-3`: **LSM-Tree Immutability**: On-disk SSTables are strictly immutable; updates and deletes (tombstones) are append-only.
- `STORAGE-4`: **Bloom Filter No-False-Negatives**: If a key exists in an SSTable, its Bloom filter bitset lookup MUST evaluate to true.

#### Visual Canvas Mechanics
- **Dual-View Switcher**: Instant toggle between interactive B+ Tree page graph and LSM-Tree storage pipeline.
- **B+ Tree Page Map**: Hierarchical node blocks showing search traversal paths (blue glow) and page splits (orange glow).
- **LSM Compaction View**: MemTable threshold meter, SSTable files per level, and animated compaction merge animations.

#### Chaos & Interactive Controls
- **Key-Value Write**: Insert keys to trigger B+ Tree splits or LSM MemTable flushes.
- **Point Lookup Search**: Step through B+ Tree page traversal or LSM Bloom filter + SSTable probing.
- **Trigger Leveled Compaction**: Manually force merge compaction from Level 0 into Level 1/2.

---

### Domain 8: TCP Networking & Congestion Control (`/networking`)

#### Protocol & Reference Model
- **Reference Standard**: RFC 793 (TCP Transmission Control Protocol) and RFC 5681 (TCP Congestion Control - AIMD).
- **Core State Model**:
  - `connectionState`: `CLOSED`, `SYN_SENT`, `SYN_RECEIVED`, `ESTABLISHED`, `FIN_WAIT_1`, `CLOSE_WAIT`, `LAST_ACK`, `TIME_WAIT`.
  - `slidingWindow`: Sender buffer slots with sequence numbers, ACK tracking, inflight state, and receiver window size ($rwnd$).
  - `congestion`: Congestion window ($cwnd$), slow start threshold ($ssthresh$), and active phase (`SLOW_START`, `CONGESTION_AVOIDANCE`, `FAST_RECOVERY`).

#### Verified Invariants
- `NET-1`: **Strict Sequence Ordering**: Inflight bytes cannot exceed $min(cwnd, rwnd)$.
- `NET-2`: **Monotonic ACK Advancement**: Cumulative ACKs advance sequence tracking monotonically.
- `NET-3`: **AIMD Multiplicative Halving**: On packet loss, $ssthresh \leftarrow \max(2, cwnd / 2)$ and $cwnd \leftarrow 1$ (or $ssthresh$ during fast recovery).

#### Visual Canvas Mechanics
- **Sequence Ladder Diagram**: Client $\leftrightarrow$ Server timeline ladder showing `SYN`, `SYN-ACK`, `ACK`, and `DATA` packets in flight.
- **Sliding Window Buffer**: Color-coded memory slot strip displaying Acknowledged (green), In-Flight (blue), Ready to Send (amber), and Outside Window (gray).
- **Real-Time AIMD Curve**: Live graph plotting $cwnd$ and $ssthresh$ across ticks demonstrating exponential Slow Start and linear Congestion Avoidance sawtooth waves.

#### Chaos & Interactive Controls
- **Initiate 3-Way Handshake**: Step through `SYN` $\to$ `SYN-ACK` $\to$ `ACK` connection establishment.
- **Transmit Data Stream**: Send buffered byte streams through the sliding window.
- **Inject Packet Drop / Retransmission**: Drop in-flight packets on the wire to watch AIMD window halving and retransmission.

---

## 3. Platform Directory Matrix

| Domain Key | System Title | Category | Reference Spec | Key Invariant |
|---|---|---|---|---|
| `/kafka` | Apache Kafka | Streaming | KRaft / Kafka 4.0 | Monotonic High Watermark |
| `/raft` | Raft Consensus | Consensus | Ongaro & Ousterhout Raft | Leader Election Safety |
| `/database` | Distributed DB | Database | Amazon Dynamo / Cassandra | Quorum Overlap ($R + W > N$) |
| `/redis` | Redis Cluster | Caching | Redis Cluster (16,384 Slots) | Full Disjoint Slot Coverage |
| `/kubernetes` | Kubernetes | Orchestration | K8s controller-runtime | Resource Non-Overcommit |
| `/rabbitmq` | RabbitMQ | Messaging | AMQP 0-9-1 / DLX | Queue FIFO & Poison DLX |
| `/storage` | Storage Engine | Storage | SQLite B+ Tree vs RocksDB LSM | Bloom Filter No False Negatives |
| `/networking` | TCP Networking | Networking | RFC 793 TCP / RFC 5681 AIMD | Strict Sliding Window Bounds |

---

## 4. Future Strategic Roadmap

1. **Distributed Transactions & 2PC / Sagas**:
   - Visualizing Two-Phase Commit (`PREPARE` $\to$ `COMMIT`/`ABORT`) and Saga Orchestration with compensating actions.
2. **Dynamic Jepsen Nemesis Generator**:
   - Automated randomized chaos test runner that runs permutations of network partitions, clock skews, and node reboots while continuously verifying invariants.
3. **Multiplayer Collaborative Scenarios**:
   - Classroom/team training mode where multiple engineers join a collaborative room to diagnose and repair simulated production outages together in real time.
4. **WebAssembly High-Throughput Reconstitutor**:
   - Rust-compiled Wasm core for ingesting and validating multi-gigabyte production event logs at 5,000,000 events/second in the browser.
