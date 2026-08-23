export interface LogRecord {
  offset: number;
  key: string | null;
  value: string | null;
  timestamp: number;
  leaderEpoch: number;
  sizeBytes: number;
}

export interface SegmentIndexEntry {
  offset: number;
  positionBytes: number;
}

export interface PhysicalLogSegment {
  baseOffset: number;
  sizeBytes: number;
  maxSizeBytes: number;
  isClosed: boolean;
  records: LogRecord[];
  indexEntries: SegmentIndexEntry[];
}

export interface LogSegmentSummary {
  baseOffset: number;
  sizeBytes: number;
  recordCount: number;
  isClosed: boolean;
}

export type PhysicalLogRecord = LogRecord;

/**
 * Manages low-level physical log segments, rolling, index building, and compaction.
 */
export class PartitionLogStorage {
  public segments: PhysicalLogSegment[] = [];
  public maxSegmentBytes: number;
  public nextOffset: number = 0;

  constructor(maxSegmentBytes: number = 10 * 1024 * 1024) {
    this.maxSegmentBytes = maxSegmentBytes;
    this.rollNewSegment(0);
  }

  private rollNewSegment(baseOffset: number): PhysicalLogSegment {
    if (this.segments.length > 0) {
      const last = this.segments[this.segments.length - 1];
      if (last) {
        last.isClosed = true;
      }
    }

    const newSeg: PhysicalLogSegment = {
      baseOffset,
      sizeBytes: 0,
      maxSizeBytes: this.maxSegmentBytes,
      isClosed: false,
      records: [],
      indexEntries: [],
    };
    this.segments.push(newSeg);
    return newSeg;
  }

  public get activeSegment(): PhysicalLogSegment {
    return this.segments[this.segments.length - 1]!;
  }

  /**
   * Appends record to the active physical segment, building a sparse index entry every 4 records.
   */
  public append(
    record: { key?: string | null; value: string | null; timestamp?: number },
    leaderEpoch: number = 0,
  ): LogRecord {
    const key = record.key ?? null;
    const value = record.value;
    const timestamp = record.timestamp ?? Date.now();

    // Approximate Kafka wire record overhead: 14 bytes header + key length + value length
    const recordBytes =
      14 + (key ? Buffer.byteLength(key, 'utf8') : 0) + (value ? Buffer.byteLength(value, 'utf8') : 0);

    // Roll segment if active exceeds limit
    if (this.activeSegment.records.length > 0 && this.activeSegment.sizeBytes + recordBytes > this.maxSegmentBytes) {
      this.rollNewSegment(this.nextOffset);
    }

    const offset = this.nextOffset++;
    const logRec: LogRecord = {
      offset,
      key,
      value,
      timestamp,
      leaderEpoch,
      sizeBytes: recordBytes,
    };

    const active = this.activeSegment;
    // Sparse index: record an entry every 4th message
    if (active.records.length % 4 === 0) {
      active.indexEntries.push({
        offset,
        positionBytes: active.sizeBytes,
      });
    }

    active.records.push(logRec);
    active.sizeBytes += recordBytes;

    return logRec;
  }

  /**
   * Executes Kafka log compaction across closed (immutable) segments.
   * - Retains only the latest record for each key.
   * - Tombstones (value === null or value === '') are preserved within delete.retention.ms window and permanently deleted once expired.
   */
  public compact(
    currentTimeMs: number = Date.now(),
    tombstoneRetentionMs: number = 86400000, // Default 24 hours (Kafka delete.retention.ms)
  ): { removedCount: number; compactedSegments: number; purgedTombstones: number } {
    if (this.segments.length <= 1) {
      return { removedCount: 0, compactedSegments: 0, purgedTombstones: 0 };
    }

    // Step 1: Scan from active backwards to find the latest record per key
    const latestRecordPerKey = new Map<string, LogRecord>();
    for (let i = this.segments.length - 1; i >= 0; i--) {
      const seg = this.segments[i]!;
      for (const rec of seg.records) {
        if (rec.key && !latestRecordPerKey.has(rec.key)) {
          latestRecordPerKey.set(rec.key, rec);
        }
      }
    }

    let totalRemoved = 0;
    let compactedCount = 0;
    let purgedTombstones = 0;

    // Step 2: Compact all closed segments
    for (let i = 0; i < this.segments.length - 1; i++) {
      const seg = this.segments[i]!;
      const originalCount = seg.records.length;

      // Filter out superseded records and expired tombstones
      seg.records = seg.records.filter((rec) => {
        if (!rec.key) return true; // Keep keyless records
        const latest = latestRecordPerKey.get(rec.key);
        if (latest?.offset !== rec.offset) {
          return false; // Superseded by a newer record
        }

        // If this latest record is a tombstone, check delete.retention.ms expiration
        const isTombstone = rec.value === null || rec.value === '';
        if (isTombstone) {
          const ageMs = currentTimeMs - rec.timestamp;
          if (ageMs >= tombstoneRetentionMs) {
            purgedTombstones++;
            return false; // Purge expired tombstone
          }
        }

        return true;
      });

      const removed = originalCount - seg.records.length;
      totalRemoved += removed;

      if (removed > 0) {
        compactedCount++;
        // Recalculate segment byte size
        seg.sizeBytes = seg.records.reduce((sum, r) => sum + r.sizeBytes, 0);
        // Rebuild sparse index
        seg.indexEntries = [];
        let currentPos = 0;
        seg.records.forEach((rec, idx) => {
          if (idx % 4 === 0) {
            seg.indexEntries.push({ offset: rec.offset, positionBytes: currentPos });
          }
          currentPos += rec.sizeBytes;
        });
      }
    }

    return { removedCount: totalRemoved, compactedSegments: compactedCount, purgedTombstones };
  }

  /**
   * Truncates log back to target offset (used in leader election reconciliation).
   */
  public truncate(targetOffset: number): void {
    if (targetOffset < 0) return;

    this.segments = this.segments.filter((seg) => seg.baseOffset <= targetOffset);
    if (this.segments.length === 0) {
      this.nextOffset = targetOffset;
      this.rollNewSegment(targetOffset);
      return;
    }

    const active = this.activeSegment;
    active.records = active.records.filter((r) => r.offset <= targetOffset);
    active.sizeBytes = active.records.reduce((sum, r) => sum + r.sizeBytes, 0);
    this.nextOffset = active.records.length > 0
      ? (active.records[active.records.length - 1]?.offset ?? 0) + 1
      : active.baseOffset;
  }

  public getSummaries(): Array<{
    baseOffset: number;
    sizeBytes: number;
    recordCount: number;
    isClosed: boolean;
  }> {
    return this.segments.map((s) => ({
      baseOffset: s.baseOffset,
      sizeBytes: s.sizeBytes,
      recordCount: s.records.length,
      isClosed: s.isClosed,
    }));
  }
}
