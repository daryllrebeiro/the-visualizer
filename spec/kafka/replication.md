# Specification: Partition Replication & High-Watermark Propagation

**Fidelity Tag**: `Behavioral`  
**Status**: Implemented (`packages/simulation`, `packages/contracts`)

---

## 1. Concept Summary

In Kafka, partition durability is achieved by replicating partition logs across multiple brokers. The partition leader receives produce requests, writes them to its local log, and followers periodically issue `Fetch` requests to catch up.

---

## 2. Replication Model

```typescript
export interface PartitionReplica {
  readonly brokerId: NodeId;
  logEndOffset: number;
  lastCaughtUpTick: VirtualTimestamp;
  isInSync: boolean;
}
```

---

## 3. High-Watermark (HW) Progression

1. **Producer Write**:
   - Record arrives at partition leader on tick $t$.
   - Leader increments its local replica $\text{LEO}_{\text{leader}} \gets \text{LEO}_{\text{leader}} + 1$.
2. **Follower Catch-up**:
   - Replicas on active brokers receive updates asynchronously:
     $$\text{LEO}_{\text{follower}} \gets \text{LEO}_{\text{leader}}$$
     $$\text{lastCaughtUpTick} \gets t$$
     $$\text{isInSync} \gets \text{true}$$
3. **HW Recalculation**:
   $$\text{HW} \gets \min_{r \in \text{ISR}} (\text{LEO}_r)$$
4. **Visibility**:
   Consumers only read records with $\text{offset} < \text{HW}$. Records above HW are considered uncommitted and invisible to consumer group fetches.
