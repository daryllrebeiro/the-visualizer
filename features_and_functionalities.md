# The Visualizer — Complete Features & Internal Architecture Guide

A comprehensive architectural reference and capabilities audit for **The Visualizer**, detailing all implemented features, protocol models, and the exact internal mechanics powering the simulation, storage, and visualization engines.

---

## 1. Complete Features & Capabilities Matrix

### 1.1 Apache Kafka Protocol & Storage Engine

| Feature / Subsystem             | Apache Kafka Spec Reference                                   | Implementation Status | Verified Source / Test                                                                                                                                                   |
| :------------------------------ | :------------------------------------------------------------ | :-------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Murmur2 Key Partitioner**     | `org.apache.kafka.common.utils.Utils.murmur2`                 | ✅ **Complete**       | [`packages/simulation/src/partitioners/murmur2.ts`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/partitioners/murmur2.ts)                 |
| **Physical Disk Log Segments**  | `.log` files (`00000000000000000000.log`), segment rolling    | ✅ **Complete**       | [`packages/simulation/src/storage/log-segment.ts`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/storage/log-segment.ts)                   |
| **Sparse Offset Indexing**      | `.index` binary offsets mapped to physical byte positions     | ✅ **Complete**       | [`packages/simulation/src/storage/log-segment.ts`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/storage/log-segment.ts)                   |
| **Log Compaction**              | Key-deduplication retaining highest offset per key            | ✅ **Complete**       | [`packages/simulation/src/storage/log-segment.ts`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/storage/log-segment.ts)                   |
| **Log Truncation**              | Unclean leader election log offset reconciliation             | ✅ **Complete**       | [`packages/simulation/src/storage/log-segment.ts`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/storage/log-segment.ts)                   |
| **2PC Transaction Coordinator** | Two-Phase Commit (`PrepareCommit`, `CompleteCommit`, markers) | ✅ **Complete**       | [`packages/simulation/src/transactions/txn-coordinator.ts`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/transactions/txn-coordinator.ts) |
| **Producer ID & Epoch Fencing** | `InitProducerId` monotonic epoch incrementing                 | ✅ **Complete**       | [`packages/simulation/src/transactions/txn-coordinator.ts`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/transactions/txn-coordinator.ts) |
| **Last Stable Offset (LSO)**    | `read_committed` vs `read_uncommitted` isolation levels       | ✅ **Complete**       | [`packages/simulation/src/transactions/txn-coordinator.ts`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/transactions/txn-coordinator.ts) |
| **KRaft Quorum Metadata**       | Controller election, metadata log replication, zero-ZK        | ✅ **Complete**       | [`packages/simulation/src/engine/state-transitions.ts`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/engine/state-transitions.ts)         |
| **ISR & Leader Election**       | High Watermark (HW) progression, ISR shrink & expansion       | ✅ **Complete**       | [`packages/simulation/src/engine/state-transitions.ts`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/engine/state-transitions.ts)         |
| **Consumer Rebalancing**        | Range & Cooperative-Sticky partition assignment protocols     | ✅ **Complete**       | [`packages/simulation/src/engine/state-transitions.ts`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/engine/state-transitions.ts)         |

### 1.2 Interactive User Interface & Deep Inspection

| Capability                     | Description                                                                            | Status          |
| :----------------------------- | :------------------------------------------------------------------------------------- | :-------------- |
| **Click-to-Inspect Drawer**    | Slide-out inspection for Partitions (`.log` viewer), Brokers, Consumers, and Producers | ✅ **Complete** |
| **Murmur2 Hash Playground**    | Real-time key hashing sandbox computing target partition with instant send trigger     | ✅ **Complete** |
| **Educational Scenarios**      | 1-click guided playbooks for Leader Failover, Cooperative Rebalance, and KRaft Quorum  | ✅ **Complete** |
| **Infinite Canvas Navigation** | Smooth mouse wheel zoom ($0.3\times \to 2.5\times$), middle/Alt drag pan, HUD controls | ✅ **Complete** |
| **Radar Minimap**              | Fixed screen-space radar HUD displaying real-time cluster entity coordinates           | ✅ **Complete** |
| **Synchronized Auto-Produce**  | Circular countdown ring with synchronized, rate-limited server timer dispatching       | ✅ **Complete** |
| **Deterministic Time-Travel**  | Playback scrubber with forward/reverse JSON Patch state restoration                    | ✅ **Complete** |
| **JSON Trace Export & Import** | Complete multi-tick timeline export (`.json`) and offline interactive replay           | ✅ **Complete** |

### 1.3 Production Infrastructure & Security

| Component                  | Technology                                                                  | Status          |
| :------------------------- | :-------------------------------------------------------------------------- | :-------------- |
| **Multi-Container Stack**  | Docker Compose with health checks (Web, API, Gateway, Redis 7, Postgres 16) | ✅ **Complete** |
| **Security Headers & CSP** | Content Security Policy, HSTS, X-Frame-Options DENY, X-Content-Type-Options | ✅ **Complete** |
| **SSRF Protection**        | Private subnet and loopback IP blocking on webhook dispatches               | ✅ **Complete** |
| **Session Rate Limiting**  | 20 msgs/sec free-tier token bucket rate limiter with backpressure           | ✅ **Complete** |
| **Automated Testing**      | 60 total passing tests (44 simulation engine + 16 websocket gateway)        | ✅ **Complete** |

---

## 2. Deep Dive: Internal Mechanics & System Architecture

### 2.1 Simulation Engine & Virtual Timeline Loop

The core simulation runs as a **Discrete-Event Simulation (DES)** in [`packages/simulation/src/engine/simulation-engine.ts`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/engine/simulation-engine.ts).

1. **Virtual Timeline (`VirtualTimeline`)**:
   - Manages a min-heap priority queue (`MinHeapPriorityQueue`) ordered by `scheduledAt` tick.
   - Events are popped sequentially. When `step(N)` is called, the timeline advances discrete ticks until `currentTick + N`.
2. **Deterministic Pseudo-Random Number Generator (`DeterministicRNG`)**:
   - Built on a seeded **SplitMix32** PRNG algorithm.
   - Every randomized cluster action (e.g. partition tie-breakers, follower replication lag, network delays) is seeded by the initial room seed.
   - **Guarantee**: Two executions with identical seed and inputs produce byte-for-byte identical state histories.
3. **Pure State Transitions (`pureStateTransition`)**:
   - Input: `(currentState, event, rng)` $\to$ Output: `{ nextState, emittedEvents }`.
   - Never mutates state in-place. Secondary events (e.g. partition leader election triggered by broker crash) are appended to the timeline priority queue.
4. **Snapshot Manager & Time-Travel (`SnapshotManager`)**:
   - Captures full keyframe snapshots periodically and calculates **RFC 6902 reverse delta patches** on intermediate ticks.
   - `seekToTick(target)` and `stepBack()` apply reverse patches in $O(1)$ time to rewind cluster state without restarting the simulation.

```text
 ┌─────────────────┐      Popped Event      ┌─────────────────────────┐
 │ Priority Queue  │ ─────────────────────► │   pureStateTransition   │
 │   (Min-Heap)    │                        │ (Deterministic Function)│
 └─────────────────┘                        └────────────┬────────────┘
         ▲                                               │
         │ Emitted Secondary Events                      ▼
         └───────────────────────────────────── { nextState, emittedEvents }
                                                         │
                                                         ▼
                                            ┌─────────────────────────┐
                                            │    InvariantChecker     │
                                            │   (8 Safety Policies)   │
                                            └─────────────────────────┘
```

---

### 2.2 Invariant Safety Verification System

The engine executes [`InvariantChecker`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/invariants/invariant-checker.ts) on every single tick across 8 distributed system invariants:

1. **Partition Leader Alive**: If `leaderBrokerId` is assigned, the broker status must be `ALIVE`.
2. **Leader in ISR**: The active leader must be a member of the partition's In-Sync Replicas (`isr`).
3. **ISR Subset of Replicas**: All brokers in `isr` must exist in the partition's configured `replicas` set.
4. **High Watermark Upper Bound**: $\text{HighWatermark} \le \min(\text{LEO of all in-sync replicas})$.
5. **Committed Offset Bound**: $\text{CommittedOffset} \le \text{HighWatermark}$ for all active consumer groups.
6. **Unique Partition Assignment**: Within a single consumer group, no topic-partition can be assigned to more than one active consumer simultaneously.
7. **Single Active KRaft Controller**: Exactly one surviving broker in the voter quorum holds the active controller role at any epoch.
8. **Monotonic Producer Epoch**: Successive transaction initializations for a `transactionalId` must increment `producerEpoch`.

If any invariant fails, the engine halts immediately (`HALTED`), captures an emergency diagnostic dump, and broadcasts `MSG_INVARIANT_VIOLATION` to clients.

---

### 2.3 Physical Disk Storage & Compaction Engine

Implemented in [`packages/simulation/src/storage/log-segment.ts`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/storage/log-segment.ts):

1. **Segment Representation**:
   - Each partition contains an array of `LogSegment` instances.
   - Formatted as `00000000000000000000.log` where the base name is the 20-digit zero-padded base offset.
2. **Segment Rolling (`segment.bytes`)**:
   - As records are appended, `sizeBytes` is computed from key, value, and record header lengths.
   - When `activeSegment.sizeBytes + recordBytes > maxSegmentBytes`, the active segment is closed (`isClosed = true`), and a new segment is rolled starting at `nextOffset`.
3. **Sparse Indexing (`.index`)**:
   - Every $N$th record appends an entry to `indexEntries` (`{ offset, positionBytes }`) allowing binary search lookups without scanning the entire file.
4. **Log Compaction (`compact()`)**:
   - Scans closed immutable segments, builds a `Map<key, highestOffset>`, and filters out superseded older versions of each key while preserving tombstone deletions and active segment records.
5. **Log Truncation (`truncate(targetOffset)`)**:
   - Discards uncommitted records beyond `targetOffset` when a lagging replica reconciles with a newly elected leader.

---

### 2.4 Murmur2 Key Partitioner

Implemented in [`packages/simulation/src/partitioners/murmur2.ts`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/partitioners/murmur2.ts):

- Replicates Apache Kafka's 32-bit Murmur2 hash implementation from Java `Utils.murmur2(byte[] data)`:
  $$\text{seed} = \mathtt{0x9747b28c}, \quad m = \mathtt{0x5bd1e995}, \quad r = 24$$
- Converts raw UTF-8 string keys to `Uint8Array` bytes and processes 4-byte chunks with bitwise integer multiplication and shifts:
  $$\text{hash} = \text{Utils.murmur2}(\text{data})$$
  $$\text{positiveHash} = \text{hash} \ \& \ \mathtt{0x7fffffff}$$
  $$\text{partition} = \text{positiveHash} \pmod{\text{numPartitions}}$$
- **Deterministic Key Routing**: Ensures identical keys (`"customer-491"`) always land on the exact same partition across all producers.

---

### 2.5 Two-Phase Commit (2PC) Transactions & LSO

Implemented in [`packages/simulation/src/transactions/txn-coordinator.ts`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/transactions/txn-coordinator.ts):

1. **Transaction Coordinator**:
   - Uses `Math.abs(hash(transactionalId)) % __transaction_state_partitions` to assign the coordinator broker.
2. **Producer ID & Epoch Fencing**:
   - `InitProducerId(transactionalId)` allocates a `producerId` and tracks `producerEpoch`.
   - Any write from an older epoch is rejected to fence zombie producers.
3. **Two-Phase Commit State Machine**:
   - `Ongoing` $\to$ `PrepareCommit` $\to$ Append `COMMIT` Control Marker to all participating topic-partitions $\to$ `CompleteCommit`.
   - `Ongoing` $\to$ `PrepareAbort` $\to$ Append `ABORT` Control Marker $\to$ `CompleteAbort`.
4. **Last Stable Offset (LSO)**:
   - For `read_committed` consumers, the LSO is the offset of the first uncommitted transaction (`firstUncommittedTxnOffset`).
   - Consumers cannot read past LSO, preventing dirty reads of aborted or ongoing transactional data.

---

### 2.6 KRaft Quorum Consensus & Failovers

Modeled in [`packages/simulation/src/engine/state-transitions.ts`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/engine/state-transitions.ts):

1. **Metadata Log**:
   - Modeled after KIP-500/KIP-595. Cluster metadata is stored as an internal log replicated among voter brokers.
2. **Controller Epoch & Heartbeats**:
   - Brokers exchange heartbeats (`lastHeartbeatTick`).
   - If the active controller broker crashes (`BROKER_STATUS_CHANGED: CRASHED`), the surviving voters trigger an instantaneous election:
     - The first surviving broker in `kraft.voters` is promoted to `activeControllerId`.
     - `controllerEpoch` is incremented.
     - A `KRAFT_LEADER_ELECTED` event is emitted.
     - The new controller reconciles partition leaderships for all partitions previously led by the dead broker.

---

### 2.7 Consumer Group Protocol & Cooperative Rebalancing

1. **Group Coordinator**:
   - Manages state machine: `Empty` $\to$ `PreparingRebalance` $\to$ `CompletingRebalance` $\to$ `Stable` $\to$ `Dead`.
2. **Protocols**:
   - **Range Assignor**: Assigns contiguous partition ranges per topic.
   - **Cooperative-Sticky Assignor**: Minimizes partition movements during membership changes, allowing unrevoked partitions to continue consuming during rebalances.
3. **Subscription Filtering**:
   - Rebalances filter partition assignments strictly against each member's `subscribedTopics` list.
4. **Polling & Commit Loop**:
   - The authoritative runner checks `highWatermark > committedOffset` for each assigned partition on every tick.
   - Records are consumed, and committed offsets are incremented sequentially.

---

### 2.8 Authoritative Gateway & Redis Event Loop

Architecture of [`apps/ws-gateway/src/gateway/runner.ts`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/apps/ws-gateway/src/gateway/runner.ts):

1. **Rate-Limited Ingestion**:
   - Client WebSocket intents are validated via Zod schemas and pushed to a Redis list (`room:<roomId>:intents`).
   - The free-tier token bucket rate limiter caps traffic at 20 msgs/sec per session to prevent flooding.
2. **10 Hz Simulation Tick Loop**:
   - An asynchronous timer executes every 100ms:
     1. Atomically drains up to 50 intents from Redis (`LRANGE` + `LTRIM`).
     2. Normalizes intent types (`INTENT_PRODUCE` $\to$ `RECORD_PRODUCED`).
     3. Evaluates active `autoProducers` and schedules keyed records on interval boundaries.
     4. Steps the simulation engine forward by 1 tick.
     5. Computes JSON Patch deltas using `fast-json-patch.compare(previousState, currentState)`.
     6. Broadcasts `EVENT_BATCH` to Redis Pub/Sub (`room:<roomId>:events`).
     7. Periodically saves replay keyframe snapshots to `simulation:<roomId>:replays`.

```text
 ┌─────────────┐   WebSocket    ┌──────────────┐   LPUSH Intents   ┌───────────────────────┐
 │ Next.js Web │ ─────────────► │  ws-gateway  │ ────────────────► │ Redis: room:1:intents │
 └─────────────┘                └──────┬───────┘                   └───────────┬───────────┘
        ▲                              │                                       │
        │ Subscribed Events            │ 10 Hz Execution Tick                  │ LRANGE (50)
        │                              ▼                                       ▼
 ┌──────┴──────────────────────────────┴───────────────────────────────────────┴───────────┐
 │ SimulationRunner (Authoritative In-Memory Engine)                                        │
 │ 1. Drain Intents  2. Step Virtual Timeline  3. Compute Patch  4. Broadcast to Redis Channel│
 └─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

### 2.9 Visualization Engine & Infinite Canvas

Architecture of [`apps/web/src/app/visualizer.tsx`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/apps/web/src/app/visualizer.tsx):

1. **60 FPS Canvas Renderer**:
   - Runs in `requestAnimationFrame` render loop with zero React state overhead during animation ticks.
2. **2D Camera Matrix (Zoom & Pan)**:
   - Maintains `camera = { x, y, zoom }`.
   - `render()` applies canvas transformation:
     $$\text{translate}(\text{width}/2 + \text{cam.x}, \text{height}/2 + \text{cam.y}) \to \text{scale}(\text{cam.zoom}, \text{cam.zoom}) \to \text{translate}(-\text{width}/2, -\text{height}/2)$$
3. **Screen-to-World Coordinate Mapping**:
   - Inverse matrix converts raw mouse events to virtual world coordinates for draggable nodes and hover inspection:
     $$\text{worldX} = \frac{\text{screenX} - \text{cx} - \text{cam.x}}{\text{cam.zoom}} + \text{cx}$$
     $$\text{worldY} = \frac{\text{screenY} - \text{cy} - \text{cam.y}}{\text{cam.zoom}} + \text{cy}$$
4. **Message Flow Particle Pipeline**:
   - Two-leg chained quadratic Bezier curves:
     - **Leg 1**: Producer $\to$ Partition Leader Broker.
     - **Leg 2 (Chained)**: Leader Broker $\to$ Follower Replicas (Replication Flow).
5. **Screen-Space Radar Minimap**:
   - Rendered outside the camera matrix at fixed canvas coordinates `(width - 144, height - 94)`.
   - Displays miniature color-coded radar blips for brokers, partitions, producers, and consumers with a bounding box indicating the active camera viewport.
