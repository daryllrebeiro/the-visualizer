# Specification: Broker Node Lifecycle & Liveness

**Fidelity Tag**: `Behavioral`  
**Status**: Implemented (`packages/simulation`, `packages/contracts`, `apps/ws-gateway`)

---

## 1. Concept Summary

In Apache Kafka, a broker is an individual server node within the cluster that receives, stores, and serves partition record logs. Brokers periodically send heartbeats to the metadata quorum (KRaft controller) and maintain local disk storage metrics.

---

## 2. Implemented Data Model

From `packages/contracts/src/domain/kafka.ts` and `packages/simulation/src/engine/types.ts`:

```typescript
export type BrokerStatus = 'ALIVE' | 'DEGRADED' | 'CRASHED' | 'RECOVERING';

export interface BrokerNode {
  readonly id: NodeId;
  readonly host: string;
  readonly port: number;
  readonly rack?: string;
  status: BrokerStatus;
  diskUsageBytes: number;
  maxDiskSizeBytes: number;
  lastHeartbeatTick: VirtualTimestamp;
}
```

---

## 3. State Transitions & Invariants

### 3.1 Status Transitions

- **`ALIVE`**: The broker is online, sending heartbeats every tick (`lastHeartbeatTick = tick`), actively serving partition leader requests, and participating in ISRs.
- **`CRASHED`**: Triggered via `CHAOS_KILL_BROKER`. Broker stops heartbeating. All partition leadership held by this broker is immediately revoked and reassigned to active ISR followers.
- **`RECOVERING`**: Triggered via `CHAOS_RECOVER_BROKER`. Broker re-enters cluster, catches up replica logs, and transitions back to `ALIVE`.
- **`DEGRADED`**: Simulates slow I/O or high latency, causing follower replication lag.

### 3.2 Invariant Checks (`packages/simulation/src/invariants/`)

1. **`BROKER_DISK_BOUND`**: `0 <= diskUsageBytes <= maxDiskSizeBytes`.
2. **`CONTROLLER_EXISTS`**: Active controller must reference a known broker in the cluster configuration.

---

## 4. Current Divergences from Real Kafka

- Disk usage is incremented linearly per produced record rather than by true physical segment batch serialization size.
- Network partition/split-brain chaos is currently modeled at the node level (`CRASHED`/`ALIVE`) rather than per-connection TCP packet drops.
