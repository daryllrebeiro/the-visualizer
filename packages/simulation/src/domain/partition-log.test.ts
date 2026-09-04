import { describe, expect, it } from 'vitest';

import { PartitionLog } from './partition-log.js';
import { InMemoryStorageAdapter } from './storage-adapter.js';

describe('PartitionLog pure domain model', () => {
  it('should append records and advance LEO monotonically', () => {
    const log = new PartitionLog('orders', 0);
    expect(log.logStartOffset).toBe(0);
    expect(log.logEndOffset).toBe(0);
    expect(log.highWatermark).toBe(0);

    const result1 = log.append([
      { key: 'k1', value: 'msg-1', timestamp: 1000, leaderEpoch: 1 },
      { key: 'k2', value: 'msg-2', timestamp: 1001, leaderEpoch: 1 },
    ]);

    expect(result1.firstOffset).toBe(0);
    expect(result1.lastOffset).toBe(1);
    expect(result1.logEndOffset).toBe(2);
    expect(result1.bytesAppended).toBeGreaterThan(0);
    expect(log.logEndOffset).toBe(2);

    const result2 = log.append([{ key: 'k3', value: 'msg-3', timestamp: 1002, leaderEpoch: 1 }]);

    expect(result2.firstOffset).toBe(2);
    expect(result2.lastOffset).toBe(2);
    expect(result2.logEndOffset).toBe(3);
    expect(log.logEndOffset).toBe(3);
  });

  it('should roll active segment when maxSegmentSizeBytes threshold is exceeded', () => {
    // Set small segment threshold (60 bytes)
    const log = new PartitionLog('orders', 0, { maxSegmentSizeBytes: 60 });
    expect(log.segmentCount).toBe(1);

    log.append([{ key: 'k1', value: 'hello-world-message-payload-1', timestamp: 1000 }]);
    log.append([{ key: 'k2', value: 'hello-world-message-payload-2', timestamp: 1001 }]);

    expect(log.segmentCount).toBeGreaterThan(1);
    expect(log.logEndOffset).toBe(2);
  });

  it('should fetch records starting at specified offset with limits', () => {
    const log = new PartitionLog('orders', 0);
    for (let i = 0; i < 10; i++) {
      log.append([{ key: `k-${String(i)}`, value: `v-${String(i)}`, timestamp: 1000 + i }]);
    }

    const fetchResult = log.fetch(4, 3);
    expect(fetchResult.records.length).toBe(3);
    expect(fetchResult.records[0]?.offset).toBe(4);
    expect(fetchResult.records[1]?.offset).toBe(5);
    expect(fetchResult.records[2]?.offset).toBe(6);
    expect(fetchResult.logEndOffset).toBe(10);
  });

  it('should truncate uncommitted records back to target offset', () => {
    const log = new PartitionLog('orders', 0);
    for (let i = 0; i < 6; i++) {
      log.append([{ value: `v-${String(i)}`, timestamp: 1000 + i }]);
    }
    expect(log.logEndOffset).toBe(6);

    log.setHighWatermark(3);
    log.truncate(4);

    expect(log.logEndOffset).toBe(4);
    expect(log.fetch(0, 10).records.length).toBe(4);
    expect(log.highWatermark).toBe(3);
  });

  it('should enforce high-watermark bounds', () => {
    const log = new PartitionLog('orders', 0);
    log.append([{ value: 'msg', timestamp: 1000 }]);

    log.setHighWatermark(1);
    expect(log.highWatermark).toBe(1);

    // Cannot decrease HW
    expect(() => log.setHighWatermark(0)).toThrow();
    // Cannot exceed LEO
    expect(() => log.setHighWatermark(5)).toThrow();
  });
});

describe('InMemoryStorageAdapter', () => {
  it('should manage lifecycle of partition logs in memory', () => {
    const adapter = new InMemoryStorageAdapter();
    expect(adapter.hasPartitionLog('orders', 0)).toBe(false);

    const log = adapter.createPartitionLog('orders', 0);
    expect(adapter.hasPartitionLog('orders', 0)).toBe(true);
    expect(adapter.getPartitionLog('orders', 0)).toBe(log);

    // Duplicate creation throws
    expect(() => adapter.createPartitionLog('orders', 0)).toThrow();

    // Query non-existent throws
    expect(() => adapter.getPartitionLog('payments', 0)).toThrow();

    expect(adapter.getAllLogs().length).toBe(1);
    adapter.deletePartitionLog('orders', 0);
    expect(adapter.hasPartitionLog('orders', 0)).toBe(false);
  });
});
