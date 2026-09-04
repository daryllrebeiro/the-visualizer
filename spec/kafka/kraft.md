# Specification: KRaft Metadata Quorum & Controller

**Fidelity Tag**: `Behavioral`  
**Status**: Implemented (`packages/contracts`, `packages/simulation`, `apps/ws-gateway`)

---

## 1. Concept Summary

Kafka Raft (KRaft) metadata mode eliminates external ZooKeeper dependencies by electing an active controller among a designated quorum of voter brokers (`@voters`). The active controller commits cluster metadata records (topic creations, broker registrations, partition assignments, leader changes) to an internal metadata log.

---

## 2. Implemented Data Model

From `packages/contracts/src/domain/kafka.ts` and `packages/simulation/src/engine/types.ts`:

```typescript
export type MetadataRecordType =
  | 'REGISTER_BROKER_RECORD'
  | 'TOPIC_RECORD'
  | 'PARTITION_RECORD'
  | 'LEADER_CHANGE_RECORD'
  | 'FENCE_BROKER_RECORD'
  | 'UNFENCE_BROKER_RECORD';

export interface MetadataRecord {
  offset: number;
  epoch: number;
  type: MetadataRecordType;
  data: Record<string, unknown>;
  timestamp: VirtualTimestamp;
}

export interface KRaftControllerState {
  activeControllerId: NodeId | null;
  controllerEpoch: number;
  voters: NodeId[];
  metadataOffset: number;
  metadataLog?: MetadataRecord[];
}
```

---

## 3. Quorum Election & Metadata Log Progression

### 3.1 Controller Failover Election

When the active controller broker crashes (`crashedBrokerId === state.kraft.activeControllerId`):

1. **Surviving Voters Filtering**:
   $$\text{activeVoters} = \{ v \in \text{voters} \mid v \neq \text{crashedId} \land \text{status}(v) = \text{ALIVE} \}$$
2. **Leader Succession**:
   - If $\text{activeVoters} \neq \emptyset$, the first eligible voter is elected as the new `activeControllerId`.
   - `controllerEpoch` increments by 1.
   - A `LEADER_CHANGE_RECORD` is appended to `state.kraft.metadataLog`, advancing `metadataOffset`.
   - A `KRAFT_LEADER_ELECTED` event is emitted.
3. **Quorum Loss**:
   - If $\text{activeVoters} = \emptyset$, `activeControllerId` is set to `null` (metadata quorum lost).

### 3.2 Metadata Event Sourcing

- **Broker Registration**: Appends `REGISTER_BROKER_RECORD`.
- **Broker Fencing / Unfencing**: Appends `FENCE_BROKER_RECORD` / `UNFENCE_BROKER_RECORD`.
- **Topic & Partition Provisioning**: Appends `TOPIC_RECORD` and `PARTITION_RECORD`s.

---

## 4. Invariant Checks (`packages/simulation/src/invariants/`)

1. **`CONTROLLER_IN_VOTERS`**: If `activeControllerId !== null`, then `activeControllerId \in voters`.
2. **`CONTROLLER_EXISTS`**: Active controller must exist in `state.brokers`.
