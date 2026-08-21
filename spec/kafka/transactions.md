# Specification: Kafka Transactions & Exactly-Once Semantics (EOS)

**Fidelity Tag**: `Behavioral`  
**Status**: Implemented (`packages/contracts`, `packages/simulation`)

---

## 1. Concept Summary
Kafka Transactions enable Atomic Multi-Partition Writes via a Two-Phase Commit (2PC) protocol coordinated by a Transaction Coordinator broker. Producers initialize a transactional session with a unique `transactionalId`, acquire a monotonic `producerId` and `producerEpoch` (fencing zombie producers), register target partition logs into the ongoing transaction, and issue Commit or Abort markers.

---

## 2. Implemented Data Model

From `packages/contracts/src/domain/kafka.ts` and `packages/simulation/src/engine/types.ts`:

```typescript
export type TransactionState =
  | 'Empty'
  | 'Ongoing'
  | 'PrepareCommit'
  | 'PrepareAbort'
  | 'CompleteCommit'
  | 'CompleteAbort'
  | 'Dead';

export interface TransactionMetadata {
  transactionalId: string;
  producerId: number;
  producerEpoch: number;
  txnTimeoutTicks: number;
  state: TransactionState;
  partitionsInTxn: { topic: string; partition: number }[];
  startTick: VirtualTimestamp;
}
```

---

## 3. Two-Phase Commit State Machine

1. **`InitProducerId`**:
   * Coordinator assigns `producerId` and increments `producerEpoch`.
   * Any future writes with a lower epoch are fenced (`PRODUCER_FENCED`).
2. **`AddPartitionsToTxn`**:
   * Transaction transitions to `Ongoing`.
   * Partitions appended to `partitionsInTxn`.
3. **`ProduceTransactionalRecords`**:
   * Records written with `isTransactional: true` and active `producerEpoch`.
   * Uncommitted records are bounded by the Last Stable Offset (LSO) and invisible to `read_committed` consumers until commit markers are appended.
4. **`EndTxn (Commit / Abort)`**:
   * Phase 1 (Prepare): Coordinator writes `PREPARE_COMMIT` or `PREPARE_ABORT` marker to `__transaction_state`.
   * Phase 2 (Write Markers): Coordinator writes commit/abort control markers to each partition log in `partitionsInTxn`.
   * Transaction transitions to `CompleteCommit` or `CompleteAbort`, advancing LSO.

---

## 4. Invariant Checks (`packages/simulation/src/invariants/`)
1. **`TRANSACTION_EPOCH_MONOTONIC`**: A producer cannot write or commit with an epoch lower than the coordinator's registered `producerEpoch`.
2. **`LSO_LEQ_HW`**: The Last Stable Offset (LSO) for `read_committed` consumers is always $\le \text{highWatermark}$.
