/**
 * Exact Apache Kafka Transaction Coordinator & Two-Phase Commit (2PC) State Machine.
 *
 * Implements:
 * 1. Transaction Coordinator broker resolution.
 * 2. Monotonic Producer ID & Epoch fencing (InitProducerId).
 * 3. 2PC Commit and Abort workflows (Prepare -> Control Markers -> Complete).
 * 4. Last Stable Offset (LSO) calculation for `read_committed` vs `read_uncommitted` consumer isolation levels.
 */

export type TransactionState =
  | 'Empty'
  | 'Ongoing'
  | 'PrepareCommit'
  | 'PrepareAbort'
  | 'CompleteCommit'
  | 'CompleteAbort'
  | 'Dead';

export interface ActiveTxnSession {
  transactionalId: string;
  coordinatorBrokerId: string;
  producerId: number;
  producerEpoch: number;
  state: TransactionState;
  partitionsInTxn: { topic: string; partition: number }[];
  startTick: number;
}

export class TransactionCoordinatorManager {
  public sessions = new Map<string, ActiveTxnSession>();
  private nextProducerIdSequence = 1000;

  /**
   * Initializes or re-attaches a transactional ID, returning a fenced producerId & incremented epoch.
   */
  public initProducerId(
    transactionalId: string,
    coordinatorBrokerId: string,
    tick: number,
  ): { producerId: number; producerEpoch: number } {
    const existing = this.sessions.get(transactionalId);
    if (existing) {
      existing.producerEpoch++;
      existing.state = 'Empty';
      existing.partitionsInTxn = [];
      existing.startTick = tick;
      return { producerId: existing.producerId, producerEpoch: existing.producerEpoch };
    }

    const producerId = this.nextProducerIdSequence++;
    const session: ActiveTxnSession = {
      transactionalId,
      coordinatorBrokerId,
      producerId,
      producerEpoch: 0,
      state: 'Empty',
      partitionsInTxn: [],
      startTick: tick,
    };

    this.sessions.set(transactionalId, session);
    return { producerId, producerEpoch: 0 };
  }

  /**
   * Registers topic-partitions into the active transaction.
   */
  public addPartitionsToTxn(
    transactionalId: string,
    producerId: number,
    producerEpoch: number,
    partitions: { topic: string; partition: number }[],
  ): boolean {
    const session = this.sessions.get(transactionalId);
    if (!session || session.producerId !== producerId || session.producerEpoch !== producerEpoch) {
      return false; // Fenced or unknown
    }

    session.state = 'Ongoing';
    for (const p of partitions) {
      if (
        !session.partitionsInTxn.some(
          (existing) => existing.topic === p.topic && existing.partition === p.partition,
        )
      ) {
        session.partitionsInTxn.push(p);
      }
    }
    return true;
  }

  /**
   * Begins Two-Phase Commit / Abort execution.
   */
  public endTxn(
    transactionalId: string,
    producerId: number,
    producerEpoch: number,
    decision: 'COMMIT' | 'ABORT',
  ): {
    success: boolean;
    controlMarkers: { topic: string; partition: number; markerType: 'COMMIT' | 'ABORT' }[];
  } {
    const session = this.sessions.get(transactionalId);
    if (!session || session.producerId !== producerId || session.producerEpoch !== producerEpoch) {
      return { success: false, controlMarkers: [] }; // Fenced
    }

    // Phase 1: Prepare
    session.state = decision === 'COMMIT' ? 'PrepareCommit' : 'PrepareAbort';

    // Phase 2: Generate Control Markers for each partition
    const controlMarkers = session.partitionsInTxn.map((p) => ({
      topic: p.topic,
      partition: p.partition,
      markerType: decision,
    }));

    // Phase 3: Complete
    session.state = decision === 'COMMIT' ? 'CompleteCommit' : 'CompleteAbort';
    session.partitionsInTxn = [];

    return { success: true, controlMarkers };
  }

  /**
   * Calculates Last Stable Offset (LSO) for a partition based on open transactions.
   */
  public computeLastStableOffset(
    _topic: string,
    _partition: number,
    highWatermark: number,
    firstUncommittedTxnOffset: number | null,
  ): number {
    if (firstUncommittedTxnOffset === null) {
      return highWatermark;
    }
    return Math.min(highWatermark, firstUncommittedTxnOffset);
  }
}
