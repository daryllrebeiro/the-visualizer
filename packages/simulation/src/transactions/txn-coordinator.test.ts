import { describe, expect, it } from 'vitest';
import { TransactionCoordinatorManager } from './txn-coordinator.js';

describe('Kafka Transaction Coordinator & 2PC Tests', () => {
  it('should initialize producerId and increment epoch upon re-attachment', () => {
    const mgr = new TransactionCoordinatorManager();
    const init1 = mgr.initProducerId('txn-order-service', 'broker-1', 10);
    expect(init1.producerId).toBeGreaterThanOrEqual(1000);
    expect(init1.producerEpoch).toBe(0);

    // Re-attachment with same transactional ID increments epoch (zombie fencing)
    const init2 = mgr.initProducerId('txn-order-service', 'broker-1', 20);
    expect(init2.producerId).toBe(init1.producerId);
    expect(init2.producerEpoch).toBe(1);
  });

  it('should reject operations from fenced producer epochs', () => {
    const mgr = new TransactionCoordinatorManager();
    const init1 = mgr.initProducerId('txn-payment-service', 'broker-1', 10);

    // Newer epoch initializes
    const init2 = mgr.initProducerId('txn-payment-service', 'broker-1', 20);
    expect(init2.producerEpoch).toBe(1);

    // Old epoch (0) attempts to add partition
    const success = mgr.addPartitionsToTxn('txn-payment-service', init1.producerId, 0, [
      { topic: 'payments', partition: 0 },
    ]);
    expect(success).toBe(false);
  });

  it('should execute 2PC Commit and emit control markers', () => {
    const mgr = new TransactionCoordinatorManager();
    const { producerId, producerEpoch } = mgr.initProducerId('txn-inventory', 'broker-1', 10);

    mgr.addPartitionsToTxn('txn-inventory', producerId, producerEpoch, [
      { topic: 'inventory', partition: 0 },
      { topic: 'inventory', partition: 1 },
    ]);

    const result = mgr.endTxn('txn-inventory', producerId, producerEpoch, 'COMMIT');
    expect(result.success).toBe(true);
    expect(result.controlMarkers.length).toBe(2);
    expect(result.controlMarkers[0]?.markerType).toBe('COMMIT');
  });

  it('should compute Last Stable Offset (LSO) correctly', () => {
    const mgr = new TransactionCoordinatorManager();

    // No ongoing transaction: LSO === HW
    expect(mgr.computeLastStableOffset('orders', 0, 10, null)).toBe(10);

    // Ongoing uncommitted transaction started at offset 4 with HW 10: LSO === 4
    expect(mgr.computeLastStableOffset('orders', 0, 10, 4)).toBe(4);
  });
});
