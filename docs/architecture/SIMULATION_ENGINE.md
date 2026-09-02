# Simulation Engine Architecture

`@the-visualizer/simulation` is a high-performance, deterministic discrete-event simulation engine for distributed systems protocols.

## Core Architectural Invariants

1. **Strict Determinism**:
   Given identical seed $S$ and event sequence $E = [e_0, e_1, \dots, e_n]$, the engine will always produce byte-for-byte identical state sequence:
   $$S_{t+1} = \text{Reducer}(S_t, e_t, \text{RNG}(seed, t))$$
   No unseeded `Math.random()`, `Date.now()`, or external I/O is permitted inside any domain reducer.

2. **Pure State Transitions**:
   State reducers are pure functions with zero mutation of the previous state object:
   ```ts
   reduceState(state: TState, event: TEvent, rng: DeterministicRNG): {
     nextState: TState;
     emittedEvents: TEvent[];
   }
   ```

3. **Continuous Invariant Checking**:
   After each state transition or tick batch, domain invariants are asserted. If an invariant fails, a structured violation record is emitted with full cluster context.

4. **Time-Travel Reconstitution**:
   Every simulation session can be exported as a `SimTraceBundle` (v1.0 schema) and reconstituted into any fresh simulator instance to replay exact state transitions.

---

## Domain Plugin Structure

Every domain visualizer implements the `DomainPlugin` contract:

```ts
export interface DomainPlugin<TState, TEvent> {
  metadata: DomainPluginMetadata;
  createDefaultState: () => TState;
  reduceState: (state: TState, event: TEvent, rng: DeterministicRNG) => { nextState: TState; emittedEvents: TEvent[] };
  validateInvariants: (state: TState) => { passed: boolean; violation?: { name: string; description: string } };
  scenarioLibrary: ScenarioDefinition[];
  oracleAdapter?: OracleAdapter;
}
```

---

## Supported Domains

| Domain | Protocol / Focus | Invariant Assertions | Fidelity |
|---|---|---|---|
| **Kafka** | KRaft Leader Election, Partition ISR, High Watermark | No Split-Brain, ISR strictly in Replicas, Monotonic HW | Oracle-Tested |
| **Raft** | Consensus, Log Replication, Leader Election | Election Safety, Leader Append-Only, State Machine Safety | Protocol-Compatible |
| **Distributed DB** | Consistent Hashing Ring, Virtual Nodes, PACELC | Quorum Consistency ($R + W > N$), Token Uniqueness | Behavioral |
| **Redis Cluster** | 16,384 Hash Slots, Master-Replica Failover, Eviction | Slot Exhaustion, Master Uniqueness, MOVED Accuracy | Behavioral |
| **Kubernetes** | Reconciliation Loop, ReplicaSet, Pod Scheduling | Desired vs Actual Convergence, Resource Non-Negative | Behavioral |
| **RabbitMQ** | AMQP 0-9-1 Exchange Bindings, DLQ Poison Routing | FIFO Ordering, Unroutable to Alternate/DLQ | Protocol-Compatible |
| **Storage Engine** | B+Tree Page Traversal, LSM MemTable / Compaction | B+Tree Sorted Order, WAL Durability, Bloom Negative Safety | Conceptual |
| **TCP Networking** | 3-Way Handshake, Sliding Window, AIMD Congestion | Seq/Ack Invariant, No CWND < 1 MSS, Byte Conservation | Protocol-Compatible |

---

## Performance Benchmark

- **Headless Throughput**: `52,000+ ticks/sec` (benchmark: `simulation-throughput.bench.test.ts`).
- **Memory Stability**: 10,000 continuous ticks with $< 50\text{ MB}$ heap delta.
