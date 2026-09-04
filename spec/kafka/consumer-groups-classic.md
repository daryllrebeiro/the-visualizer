# Specification: Classic Consumer Groups & Dynamic Rebalancing

**Fidelity Tag**: `Behavioral`  
**Status**: Implemented (`packages/simulation`, `packages/contracts`, `apps/ws-gateway`, `apps/web`)

---

## 1. Concept Summary

Kafka classic consumer groups coordinate multiple consumer instances to read from partitions in parallel while guaranteeing that each partition in a topic is consumed by at most one consumer in the group at any given time.

---

## 2. Implemented Data Model

From `packages/contracts/src/domain/kafka.ts` and `packages/simulation/src/engine/types.ts`:

```typescript
export type ConsumerGroupState =
  'Empty' | 'PreparingRebalance' | 'CompletingRebalance' | 'Stable' | 'Dead';
export type ConsumerProtocol = 'range' | 'roundrobin' | 'cooperative-sticky';

export interface ConsumerGroupMember {
  readonly memberId: string;
  readonly clientId: string;
  readonly clientHost: string;
  assignedPartitions: { topic: TopicName; partition: PartitionId }[];
  lastHeartbeatTick: VirtualTimestamp;
  subscribedTopics?: string[];
}

export interface ConsumerGroup {
  readonly id: ConsumerGroupId;
  state: ConsumerGroupState;
  protocol: ConsumerProtocol;
  generationId: number;
  leaderMemberId: string | null;
  members: Record<string, ConsumerGroupMember>;
  committedOffsets: Record<TopicName, Record<PartitionId, number>>;
}
```

---

## 3. Rebalancing Protocol

### 3.1 State Transitions

1. **Join Trigger**: `CONSUMER_JOINED` adds a member to `group.members` with target `subscribedTopics`.
2. **Leave Trigger**: `CONSUMER_LEFT` removes the member from `group.members`.
3. **Partition Assignment**:
   - For each active topic in the cluster:
     - Find all group members subscribed to that topic.
     - If no members subscribed, skip assignment for that topic.
     - Distribute topic partitions across subscribed members using the assigned assignment protocol (default: `range`/round-robin).
4. **Generation Update**: `generationId` increments by 1. Group state transitions to `Stable` (or `Empty` if 0 members remain).

### 3.2 Offset Commit Mechanics

- When a consumer processes messages up to an offset, a `RECORD_CONSUMED` event updates `group.committedOffsets[topic][partition]`.
- Invariant: `committedOffset <= partition.highWatermark`.

---

## 4. Current Invariants (`packages/simulation/src/invariants/`)

1. **`COMMITTED_OFFSET_BOUND`**: Group committed offsets must never exceed partition high-watermark.
2. **`PARTITION_EXCLUSIVE_ASSIGNMENT`**: Within a consumer group, no single partition $(T, P)$ may be assigned to more than one consumer member simultaneously.
