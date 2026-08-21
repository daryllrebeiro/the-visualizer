/**
 * Exact Apache Kafka Physical Disk Log Segment & Indexing Model.
 *
 * Implements:
 * 1. Monotonic offset log appending.
 * 2. Automatic segment rolling (`segment.bytes` threshold).
 * 3. Sparse offset indexing (.index).
 * 4. Background Log Compaction (key-deduplication retaining newest offset).
 * 5. Log Truncation for Unclean Leader Election recovery.
 */

export interface PhysicalLogRecord {
  offset: number;
  timestamp: number;
  key: string;
  value: string;
  isControlMarker?: boolean | undefined;
  markerType?: ('COMMIT' | 'ABORT') | undefined;
  producerId?: number | undefined;
  producerEpoch?: number | undefined;
  sizeBytes: number;
}

export interface LogIndexEntry {
  offset: number;
  positionBytes: number;
}

export interface LogSegment {
  baseOffset: number;
  sizeBytes: number;
  maxSizeBytes: number;
  records: PhysicalLogRecord[];
  isClosed: boolean;
  createdTick: number;
  lastModifiedTick: number;
  indexEntries: LogIndexEntry[];
}

export interface LogSegmentSummary {
  baseOffset: number;
  sizeBytes: number;
  recordCount: number;
  isClosed: boolean;
  isActive: boolean;
  firstOffset: number | null;
  lastOffset: number | null;
}

export class PartitionLogStorage {
  public segments: LogSegment[] = [];
  public nextOffset = 0;
  public readonly maxSegmentBytes: number;

  constructor(maxSegmentBytes = 1024) {
    this.maxSegmentBytes = maxSegmentBytes;
    this.rollNewSegment(0, 0);
  }

  get activeSegment(): LogSegment {
    const active = this.segments[this.segments.length - 1];
    if (!active) {
      return this.rollNewSegment(this.nextOffset, 0);
    }
    return active;
  }

  /**
   * Rolls a new active segment and closes the previous active segment.
   */
  public rollNewSegment(baseOffset: number, tick: number): LogSegment {
    if (this.segments.length > 0) {
      const prev = this.segments[this.segments.length - 1]!;
      prev.isClosed = true;
    }

    const newSegment: LogSegment = {
      baseOffset,
      sizeBytes: 0,
      maxSizeBytes: this.maxSegmentBytes,
      records: [],
      isClosed: false,
      createdTick: tick,
      lastModifiedTick: tick,
      indexEntries: [],
    };

    this.segments.push(newSegment);
    return newSegment;
  }

  /**
   * Appends a record to the active segment, creating an index entry and rolling if threshold is met.
   */
  public append(
    recordData: {
      key: string;
      value: string;
      timestamp: number;
      isControlMarker?: boolean;
      markerType?: 'COMMIT' | 'ABORT';
      producerId?: number;
      producerEpoch?: number;
    },
    tick: number,
  ): { offset: number; rolled: boolean } {
    const offset = this.nextOffset++;
    // Approximate on-disk record byte size (key + val + headers + offset overhead)
    const estimatedRecordBytes =
      new TextEncoder().encode(recordData.key).length +
      new TextEncoder().encode(recordData.value).length +
      32;

    let active = this.activeSegment;
    let rolled = false;

    // Check if appending would exceed max segment capacity (unless active segment is completely empty)
    if (active.records.length > 0 && active.sizeBytes + estimatedRecordBytes > this.maxSegmentBytes) {
      active = this.rollNewSegment(offset, tick);
      rolled = true;
    }

    const physicalRecord: PhysicalLogRecord = {
      offset,
      timestamp: recordData.timestamp,
      key: recordData.key,
      value: recordData.value,
      isControlMarker: recordData.isControlMarker,
      markerType: recordData.markerType,
      producerId: recordData.producerId,
      producerEpoch: recordData.producerEpoch,
      sizeBytes: estimatedRecordBytes,
    };

    // Sparse Index: add entry every 4th record or on first record of segment
    if (active.records.length % 4 === 0) {
      active.indexEntries.push({
        offset,
        positionBytes: active.sizeBytes,
      });
    }

    active.records.push(physicalRecord);
    active.sizeBytes += estimatedRecordBytes;
    active.lastModifiedTick = tick;

    return { offset, rolled };
  }

  /**
   * Executes Kafka log compaction across closed (immutable) segments.
   * Retains only the latest record for each key.
   */
  public compact(): { removedCount: number; compactedSegments: number } {
    if (this.segments.length <= 1) {
      return { removedCount: 0, compactedSegments: 0 };
    }

    // Step 1: Scan from active backwards to find the latest offset per key
    const latestOffsetPerKey = new Map<string, number>();
    for (let i = this.segments.length - 1; i >= 0; i--) {
      const seg = this.segments[i]!;
      for (const rec of seg.records) {
        if (rec.key && !latestOffsetPerKey.has(rec.key)) {
          latestOffsetPerKey.set(rec.key, rec.offset);
        }
      }
    }

    let totalRemoved = 0;
    let compactedCount = 0;

    // Step 2: Compact all closed segments
    for (let i = 0; i < this.segments.length - 1; i++) {
      const seg = this.segments[i]!;
      const originalCount = seg.records.length;

      // Filter out superseded records
      seg.records = seg.records.filter((rec) => {
        if (!rec.key) return true; // Keep keyless records
        const latest = latestOffsetPerKey.get(rec.key);
        return latest === rec.offset;
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

    return { removedCount: totalRemoved, compactedSegments: compactedCount };
  }

  /**
   * Truncates log back to target offset (used in leader election reconciliation).
   */
  public truncate(targetOffset: number): void {
    if (targetOffset < 0) return;

    this.segments = this.segments.filter((seg) => seg.baseOffset <= targetOffset);
    if (this.segments.length === 0) {
      this.nextOffset = targetOffset;
      this.rollNewSegment(targetOffset, 0);
      return;
    }

    const lastSeg = this.segments[this.segments.length - 1]!;
    lastSeg.records = lastSeg.records.filter((r) => r.offset <= targetOffset);
    lastSeg.isClosed = false;
    lastSeg.sizeBytes = lastSeg.records.reduce((sum, r) => sum + r.sizeBytes, 0);
    this.nextOffset = targetOffset + 1;
  }

  /**
   * Produces a lightweight summary array of segments for UI inspector rendering.
   */
  public getSummaries(): LogSegmentSummary[] {
    const active = this.activeSegment;
    return this.segments.map((seg) => ({
      baseOffset: seg.baseOffset,
      sizeBytes: seg.sizeBytes,
      recordCount: seg.records.length,
      isClosed: seg.isClosed,
      isActive: seg === active,
      firstOffset: seg.records[0]?.offset ?? null,
      lastOffset: seg.records[seg.records.length - 1]?.offset ?? null,
    }));
  }
}
