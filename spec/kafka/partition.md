# Specification: Partition Leadership, Replication & ISR

**Fidelity Tag**: `Behavioral (Clean Election Only)`  
**Status**: Implemented (`packages/simulation`, `packages/contracts`)

---

## 1. Concept Summary

A Kafka topic is partitioned across cluster brokers for parallelism and durability. Each partition has a designated **Leader Broker** and a set of **Follower Replicas**. Replicas that are caught up with the leader form the **In-Sync Replicas (ISR)**. The **High-Watermark (HW)** represents the highest offset acknowledged across all ISR members and is safe for consumer consumption.

---

## 2. Implemented Data Model

```typescript
export interface PartitionReplica {
  readonly brokerId: NodeId;
  logEndOffset: number;
  lastCaughtUpTick: VirtualTimestamp;
  isInSync: boolean;
}

export interface TopicPartition {
  readonly topic: TopicName;
  readonly partition: PartitionId;
  leaderBrokerId: NodeId | null;
  leaderEpoch: number;
  replicas: PartitionReplica[];
  isr: NodeId[];
  highWatermark: number;
  minInsyncReplicas: number;
  uncleanLeaderElectionEnabled: boolean;
}
```

---

## 3. Behavior & Algorithms

### 3.1 Record Production & Replication Flow

1. When `RECORD_PRODUCED` executes, the leader broker's replica increments its `logEndOffset` (LEO).
2. Alive followers asynchronously catch up (`replica.logEndOffset = newLeo; replica.isInSync = true`).
3. High-Watermark recalculation:
   $$\text{HW}_{\text{new}} = \min_{r \in \text{ISR}} (\text{LEO}_r)$$
4. If $\text{HW}_{\text{new}} > \text{HW}_{\text{current}}$, a `HIGH_WATERMARK_ADVANCED` event is emitted.

### 3.2 Leader Election on Broker Crash

When the leader broker crashes (`BROKER_STATUS_CHANGED` with `status: 'CRASHED'`):

1. **Clean Leader Election**: The engine selects the first alive broker from the partition's active `isr` list:
   $$\text{activeISR} = \{ b \in \text{ISR} \mid \text{status}(b) = \text{ALIVE} \}$$
2. If $\text{activeISR} \neq \emptyset$, the first member is elected as new leader, `leaderEpoch` increments by 1, and the ISR shrinks.
3. If $\text{activeISR} = \emptyset$, `leaderBrokerId` is set to `null` (Partition is marked **OFFLINE**).

### 3.3 Explicit Architectural Decision: Unclean Leader Election

- **Current Status**: Clean leader election only.
- **Decision**: `uncleanLeaderElectionEnabled: boolean` exists in the schema contract and UI hover cards, but the state transition engine (`state-transitions.ts`) currently defaults to clean election and marks the partition offline if no in-sync replicas are available. Enabling out-of-sync leader election with data loss semantics is scheduled for Phase 4.

---

## 4. Invariants (`packages/simulation/src/invariants/`)

1. **`LEADER_IN_ISR`**: `leaderBrokerId !== null` $\implies \text{leaderBrokerId} \in \text{ISR}$.
2. **`HIGH_WATERMARK_BOUND`**: $\text{HW} \le \min_{r \in \text{ISR}} (\text{LEO}_r)$.
3. **`MIN_ISR_VIOLATION`**: If $|\text{ISR}| < \text{minInsyncReplicas}$, new produce requests requiring `acks: -1` (all) are rejected.
