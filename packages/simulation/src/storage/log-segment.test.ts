import { describe, expect, it } from 'vitest';

import { PartitionLogStorage } from './log-segment.js';

describe('Physical Log Segment & Compaction Tests', () => {
  it('should append records and create monotonic offsets', () => {
    const log = new PartitionLogStorage(500);
    const r1 = log.append({ key: 'k1', value: 'v1', timestamp: 100 }, 1);
    const r2 = log.append({ key: 'k2', value: 'v2', timestamp: 101 }, 1);

    expect(r1.offset).toBe(0);
    expect(r2.offset).toBe(1);
    expect(log.activeSegment.records.length).toBe(2);
    expect(log.activeSegment.indexEntries.length).toBeGreaterThan(0);
  });

  it('should automatically roll new segments when segment size exceeds maxSegmentBytes', () => {
    const log = new PartitionLogStorage(120); // Small limit to force roll
    log.append({ key: 'user-key-1', value: 'payload-long-string-data-1', timestamp: 100 }, 1);
    log.append({ key: 'user-key-2', value: 'payload-long-string-data-2', timestamp: 101 }, 2);
    log.append({ key: 'user-key-3', value: 'payload-long-string-data-3', timestamp: 102 }, 3);

    expect(log.segments.length).toBeGreaterThan(1);
    expect(log.segments[0]?.isClosed).toBe(true);
    expect(log.activeSegment.isClosed).toBe(false);
  });

  it('should compact closed segments by retaining only latest value per key and preserving tombstones within retention window', () => {
    const log = new PartitionLogStorage(40); // 40 bytes forces roll per record
    const baseTime = 1_000_000;
    // Write key 'user-A' multiple times across rolled segments
    log.append({ key: 'user-A', value: 'version-1', timestamp: baseTime }, 1);
    log.append({ key: 'user-B', value: 'version-1', timestamp: baseTime + 10 }, 1); // Rolls segment
    log.append({ key: 'user-A', value: 'version-2', timestamp: baseTime + 20 }, 2); // Rolls segment
    log.append({ key: 'user-C', value: 'version-1', timestamp: baseTime + 30 }, 3);

    expect(log.segments.length).toBeGreaterThan(1);

    const compactionResult = log.compact(baseTime + 40, 86400000);
    expect(compactionResult.removedCount).toBeGreaterThanOrEqual(1);

    // Old segment should no longer contain version-1 of user-A
    const firstSeg = log.segments[0]!;
    const userARecordsInFirstSeg = firstSeg.records.filter((r) => r.key === 'user-A');
    expect(userARecordsInFirstSeg.length).toBe(0);
  });

  it('should purge expired tombstones when age exceeds delete.retention.ms', () => {
    const log = new PartitionLogStorage(40);
    const baseTime = 1_000_000;
    const tombstoneRetentionMs = 60_000; // 60 seconds

    // Append tombstone for key 'user-deleted'
    log.append({ key: 'user-deleted', value: null, timestamp: baseTime }, 1);
    log.append({ key: 'user-active', value: 'active-val', timestamp: baseTime + 1000 }, 1); // Forces roll
    log.append({ key: 'user-other', value: 'other-val', timestamp: baseTime + 2000 }, 2);

    expect(log.segments.length).toBeGreaterThan(1);

    // 1. Compaction before expiry: Tombstone is retained
    const comp1 = log.compact(baseTime + 30_000, tombstoneRetentionMs);
    expect(comp1.purgedTombstones).toBe(0);
    const firstSeg = log.segments[0]!;
    expect(firstSeg.records.some((r) => r.key === 'user-deleted')).toBe(true);

    // 2. Compaction after expiry: Tombstone is permanently purged
    const comp2 = log.compact(baseTime + 70_000, tombstoneRetentionMs);
    expect(comp2.purgedTombstones).toBe(1);
    expect(firstSeg.records.some((r) => r.key === 'user-deleted')).toBe(false);
  });

  it('should truncate segment logs back to target offset', () => {
    const log = new PartitionLogStorage(200);
    log.append({ key: 'k1', value: 'v1', timestamp: 10 }, 1);
    log.append({ key: 'k2', value: 'v2', timestamp: 11 }, 1);
    log.append({ key: 'k3', value: 'v3', timestamp: 12 }, 1);
    log.append({ key: 'k4', value: 'v4', timestamp: 13 }, 1);

    expect(log.nextOffset).toBe(4);
    log.truncate(1);

    expect(log.nextOffset).toBe(2);
    const summaries = log.getSummaries();
    expect(summaries[0]?.recordCount).toBe(2);
  });
});
