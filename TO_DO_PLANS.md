# TheVisualizer — Future Implementation Plans & Roadmap

This document tracks upcoming architectural initiatives, features, and roadmap items for TheVisualizer.

---

## 1. Recreate Events and State from Given Event Log (Phase 2: Event-Driven Simulation Reconstitution)

### Objective
Provide the capability to ingest a raw, serialized event log or JSON trace stream, and deterministically reconstruct the exact historical cluster topology, state transitions, partition offsets, consumer assignments, and animated packet flows without requiring live gateway communication.

### Core Architecture & Capabilities
1. **Log Ingestion & Schema Normalization**:
   - Parse historical `SimEventLog[]` / `SimEvent[]` trace files.
   - Validate event sequence, timestamps, logical simulation ticks, and `involvedEntities` metadata against Zod contract schemas.
   - Detect and resolve missing or partial snapshots using state delta patching (`fast-json-patch`).

2. **Deterministic State Reconstitution Engine**:
   - Execute pure state transitions (`pureStateTransition(state, event, rng)`) sequentially from an initial topology snapshot (or infer initial baseline state from early declaration events).
   - Replay offset progressions, ISR shrink/expansion history, leader election epochs, and consumer group rebalance assignments step-by-step.
   - Enforce the 8 Kafka safety invariants during each reconstituted step to verify that the imported log represents a valid, uncorrupted Kafka execution history.

3. **Reusable Scenario Generator**:
   - Convert imported or recorded event logs into shareable, executable Scenario Definitions (`ScenarioDefinition`).
   - Allow users to export custom failure sequences (e.g. cascading broker crashes, slow consumer lag, transactional aborts) recorded in real time and re-run them as repeatable educational playbooks.

4. **UI Scrubber & Step-by-Step Step Controller**:
   - Interactive time-travel scrubber across reconstituted ticks ($t_0 \to t_{\text{end}}$).
   - Step forward / step backward single-event execution.
   - Jump to specific event index or invariant violation timestamp.
   - Export reconstituted state bundle as standalone test fixtures for unit and CI regression suites.

---

# TheVisualizer Platform — Future Integrations Roadmap (Beyond Kafka)

## Sequencing principle

Order by **(architecture reuse) × (availability of a real oracle to verify against) × (standalone educational demand)** — not by novelty or excitement. The Kafka project's biggest strength ended up being "verified against a real reference system," not "looks impressive." Every future integration should inherit that same discipline: pick domains where a real open-source reference implementation exists and can run in Docker/Testcontainers, the same way `apache/kafka:4.3.x` anchored the Kafka work.

---

## Prerequisite — the platform extraction (recap, now made concrete per-integration)

Before Integration 1 starts, `sim-kernel`, `sim-gateway-core`, and `sim-canvas-core` need to exist as genuinely domain-agnostic packages (per the prior plan). One addition worth specifying now, since it only becomes obvious once a second domain is in view:

**A `DomainPlugin` interface**, so the gateway and canvas shell don't need to know which domain they're running:

```typescript
interface DomainPlugin {
  id: string;                          // 'kafka' | 'raft' | 'cassandra' | ...
  reducers: Record<string, Reducer>;   // domain-specific state transitions
  validators: Record<string, Validator>;
  entityRenderers: Record<string, CanvasRenderer>;  // how this domain's nodes draw themselves
  scenarioLibrary: Scenario[];
  oracleAdapter?: OracleAdapter;       // optional, if a real reference system exists
}
```

This is what turns "rebuild a new visualizer" into "write a new plugin" — the gateway, room management, auth, rate limiting, and canvas camera/drag/zoom system stay identical across every domain; only the plugin changes. Do this extraction with at least Kafka and one placeholder stub plugin in mind, so the interface isn't accidentally shaped around Kafka's specifics alone.

---

## Integration 1 — Raft / Paxos Consensus

**Why first:** highest reuse of anything already built (KRaft's quorum, election, and log-replication machinery generalizes almost directly), strongest standalone educational demand, and multiple real, well-known reference implementations to verify against.

**Core concepts to model:** leader election with randomized timeouts (a genuine addition — KRaft's simplified deterministic election was explicitly flagged as a simplification; a real Raft visualizer should model this properly), log replication, commit index vs. applied index, term numbers, vote requests/grants, split-brain/network-partition scenarios, snapshot/log-compaction (Raft's own, distinct from Kafka's).

**Reuse vs. new work:**
- Reused directly: the discrete-event kernel, snapshot/replay, canvas camera/drag/zoom/particle system, room/gateway/auth infrastructure.
- Generalized from Kafka: the metadata-log-replay concept, quorum/voter modeling, controller-epoch-style term tracking.
- Genuinely new: randomized election timeouts (a real correctness-relevant mechanism Raft depends on that KRaft's simplification skipped), log-matching property enforcement, the specific RPC set (`RequestVote`, `AppendEntries`, `InstallSnapshot`).

**Oracle strategy:** `etcd`'s Raft implementation (`etcd-io/raft`, the extracted library) or HashiCorp's `raft` library are both real, widely-used, and dockerizable — either is a legitimate oracle in the same spirit as the Kafka Testcontainers approach. Recommend etcd's, since etcd itself is easy to run in a container and has an accessible API to drive scenarios against.

**Signature features:** an election-timeout race visualizer (showing the randomized timers ticking down concurrently across nodes — this is the single most-requested kind of Raft visualization and nothing existing does it interactively with real backing logic), a deliberate network-partition/split-brain lab, and a side-by-side "why did Raft choose this leader" causality view, reusing the "Why Did This Happen?" pattern from the original Kafka design.

**Rough phases:** spec extraction (reuse KRaft's spec-file convention) → kernel-level randomized-timeout support (a real kernel enhancement, not just domain logic, since the existing scheduler assumed deterministic seeded randomness for reproducibility — reconcile these two needs explicitly) → core election/replication logic → oracle harness → canvas visualization → scenario library. Given the reuse, this should be materially faster than Kafka's original build.

---

## Integration 2 — Distributed Database: Sharding, Replication & Consistent Hashing

**Why second:** natural extension of Raft (many real systems, like CockroachDB and TiDB, literally use Raft per-shard) and reuses Kafka's partition/replica/ISR concepts under different names.

**Core concepts to model:** consistent hashing / hash-ring partitioning (genuinely new — Kafka uses static partition assignment, not a ring), quorum reads/writes (`N`, `R`, `W` tunable consistency, a new dimension Kafka doesn't have in the same form), read-repair and hinted handoff, vector clocks or last-write-wins conflict resolution, node addition/removal and data rebalancing across the ring.

**Reuse vs. new work:**
- Reused: replication/leader concepts generalize from Kafka's ISR and Integration 1's Raft work (if per-shard consensus is modeled).
- Genuinely new: the hash ring itself (a distinct, very visual data structure — this is a great candidate for a dedicated ring-diagram view, different from Kafka's broker/partition cards), tunable consistency levels, conflict resolution on concurrent writes.

**Oracle strategy:** Apache Cassandra has an official Docker image and is the most natural real-system oracle for this domain; alternatively ScyllaDB (Cassandra-compatible, lighter to run) if container startup time matters for CI.

**Signature features:** an animated hash-ring view showing where a key lands and which nodes replicate it, a live "consistency level" slider showing how `R + W > N` trades off correctness vs. latency in real time, and a rebalancing animation when a node joins/leaves the ring.

**Rough phases:** similar shape to Integration 1 — spec extraction, hash-ring + replication core, quorum read/write logic, oracle harness against Cassandra, ring visualization, scenario library (node failure, network partition, concurrent conflicting writes).

---

## Integration 3 — Distributed Caching (Redis Cluster)

**Why third:** shares real overlap with Integration 2's sharding work, but is a smaller, more focused domain — good candidate for a faster-turnaround project between two bigger ones.

**Core concepts to model:** hash slot assignment (Redis Cluster's 16384-slot model — a specific, well-documented variant of sharding, distinct enough from Integration 2's approach to be worth its own treatment rather than folding in), primary/replica pairs per slot range, `MOVED`/`ASK` redirection during resharding, eviction policies (LRU/LFU/TTL — genuinely new, nothing built so far models cache eviction).

**Reuse vs. new work:** heavy reuse of Integration 2's sharding/replication visualization patterns; genuinely new work is mostly the eviction-policy modeling and the specific slot-redirection protocol behavior.

**Oracle strategy:** real Redis Cluster mode is straightforward to run via Docker Compose (multiple `redis-server --cluster-enabled yes` instances) — a very achievable, high-fidelity oracle.

**Signature features:** an eviction-policy sandbox (fill the cache, watch different policies decide what to evict, compare hit rates side by side), a slot-redirection visualizer showing a client getting `MOVED` during a live resharding operation.

**Rough phases:** given the reuse from Integration 2, this should be the fastest of the four so far — mostly domain-model work (slots, eviction) on top of an already-mature sharding/replication visualization layer.

---

## Integration 4 — Container Orchestration (Kubernetes Scheduler & Networking)

**Why fourth, not earlier:** highest standalone demand of any candidate, but genuinely the least reuse of anything built so far — pod scheduling, service discovery, and networking are a different conceptual shape (declarative desired-state reconciliation loops, not primarily consensus/replication). Sequencing it after three consensus/replication-family projects means the team has a mature platform to lean on precisely when the domain logic itself is the hard, novel part.

**Core concepts to model:** the reconciliation-loop pattern itself (desired state vs. actual state, controllers converging the two — a genuinely new simulation paradigm, arguably closer to a continuous control loop than a discrete event sequence, worth flagging as a possible kernel-model stress test), pod scheduling (bin-packing onto nodes under resource constraints), service/endpoint networking, deployments/rollouts and rolling-update strategies, node pressure and eviction.

**Reuse vs. new work:** platform layer (gateway, rooms, canvas) reused fully; almost all domain logic is new. This is explicitly the "spend the novelty budget here" project, once the platform has proven itself three times over on easier domains.

**Oracle strategy:** `kind` (Kubernetes-in-Docker) provides a real, full Kubernetes API server runnable in CI — a strong oracle, directly analogous to the Kafka Testcontainers pattern.

**Signature features:** a live bin-packing visualizer for the scheduler's node-selection decision, a rolling-deployment animation showing old/new pod replacement over time, and a "why is this pod pending" causality inspector (resource pressure, taints/tolerations, affinity rules) — directly reusing the "Why Did This Happen?" pattern established all the way back in the original Kafka design.

---

## Integration 5+ (exploratory / lower priority, revisit after the above)

Shorter treatment — these are real candidates but shouldn't be scheduled ahead of Integrations 1–4 without a specific reason (e.g., a customer/user request that changes the priority calculus):

| Candidate | One-line scope | Oracle available? |
|---|---|---|
| **Message queue diversity** (RabbitMQ/AMQP, or SQS-style) | Different delivery-guarantee model (queues + exchanges vs. Kafka's log) — good contrast piece once Kafka's log-based model is well understood by users. | Yes — real RabbitMQ Docker image. |
| **Networking fundamentals** (TCP handshake/congestion control, DNS resolution) | Packet-level timing rather than higher-level event state machines — may stress the kernel's assumptions in new ways; worth a small spike before committing. | Partial — can compare against real `tcpdump`/`Wireshark` captures rather than a live running oracle. |
| **Storage engine internals** (B-tree vs. LSM-tree, similar to what Kafka's log-segment work already touched) | A "how does a database index actually work" visualizer — direct extension of work already done for Kafka's log storage. | Yes — SQLite (B-tree) and RocksDB/LevelDB (LSM) are both real, inspectable references. |
| **Blockchain / alternative consensus** (PoW/PoS, fork resolution) | High public interest, but weaker fit with the "verify against a real production system" discipline the whole platform is built on — most public chains are too heavyweight to run as a lightweight oracle. | Weak — would likely mean building a toy reference rather than verifying against a real, widely-trusted implementation, which breaks the project's core methodology. |

---

## Master sequencing

| Order | Integration | Primary reuse source | Oracle | Relative effort vs. original Kafka build |
|---|---|---|---|---|
| 0 | Platform extraction | — | — | Small, one-time |
| 1 | Raft/Paxos | KRaft | etcd raft library | Materially less |
| 2 | Distributed DB (sharding) | Raft + Kafka replication | Cassandra/ScyllaDB | Moderate |
| 3 | Distributed caching (Redis Cluster) | Integration 2 | Redis Cluster (real) | Least of all five |
| 4 | Kubernetes scheduler/networking | Platform layer only | `kind` | Comparable to or more than original Kafka build (novel domain) |
| 5+ | Message queues / storage engines / networking / blockchain | Varies | Varies (blockchain notably weak) | Case-by-case |

---

## Cross-cutting platform work needed as domains multiply

- [ ] **A domain directory/landing page** once there are 2+ integrations live — users need to pick which simulator they want, and the product identity shifts from "the Kafka visualizer" to "the distributed-systems visualizer platform" at that point, which has UX and naming implications worth deciding deliberately rather than backing into.
- [x] **Generalize the fidelity-tagging system** (Conceptual → Behavioral → Kafka-tested → Protocol-compatible → Version-compatible) to be domain-parameterized rather than Kafka-named, so it reads correctly as "Raft-tested," "Cassandra-tested," etc. without a rename each time.
- [x] **Generalize the oracle-harness pattern** built for Kafka into a reusable `OracleAdapter` interface (per the `DomainPlugin` sketch above) so each new integration implements one adapter rather than rebuilding the Testcontainers/diff-engine scaffolding from scratch.
- [x] **Decide room/session scope across domains** — can one room hold multiple simulator types side by side (e.g., comparing Raft and Paxos in the same session), or is a room always single-domain? Worth deciding before Integration 2 ships, since retrofitting multi-domain rooms later is harder than designing for it now even if it's not built yet.
