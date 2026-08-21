/**
 * packages/simulation/src/domain/partition-log.ts
 *
 * Pure in-memory domain model for an append-only Kafka partition commit log.
 * Zero external I/O dependencies.
 */

export interface LogRecord {
  readonly offset: number;
  readonly key: string | null;
  readonly value: string;
  readonly timestamp: number;
  readonly leaderEpoch: number;
  readonly sizeBytes: number;
}

export interface LogSegment {
  readonly baseOffset: number;
  records: LogRecord[];
  sizeBytes: number;
  closed: boolean;
}

export interface AppendResult {
  readonly firstOffset: number;
  readonly lastOffset: number;
  readonly logEndOffset: number;
  readonly bytesAppended: number;
}

export interface FetchResult {
  readonly records: LogRecord[];
  readonly highWatermark: number;
  readonly logEndOffset: number;
}

export interface PartitionLogOptions {
  maxSegmentSizeBytes?: number;
  initialOffset?: number;
}

export class PartitionLog {
  public readonly topic: string;
  public readonly partition: number;
  private readonly maxSegmentSizeBytes: number;
  private segments: LogSegment[] = [];
  private _highWatermark: number = 0;

  constructor(topic: string, partition: number, options?: PartitionLogOptions) {
    this.topic = topic;
    this.partition = partition;
    this.maxSegmentSizeBytes = options?.maxSegmentSizeBytes ?? 1024 * 1024; // 1 MB default
    const initialOffset = options?.initialOffset ?? 0;

    this.segments.push({
      baseOffset: initialOffset,
      records: [],
      sizeBytes: 0,
      closed: false,
    });
  }

  /**
   * Appends records atomically to the active log segment.
   */
  public append(
    inputs: { key?: string | null; value: string; timestamp: number; leaderEpoch?: number }[],
  ): AppendResult {
    if (inputs.length === 0) {
      const leo = this.logEndOffset;
      return {
        firstOffset: leo,
        lastOffset: leo,
        logEndOffset: leo,
        bytesAppended: 0,
      };
    }

    const firstOffset = this.logEndOffset;
    let currentOffset = firstOffset;
    let bytesAppended = 0;

    for (const input of inputs) {
      let activeSegment = this.activeSegment;

      // Calculate approximate record binary size (key + value + header overhead)
      const recordBytes =
        (input.key?.length ?? 0) +
        input.value.length +
        32; // 32 bytes metadata overhead (offset, epoch, timestamp, crc)

      // Roll active segment if size limit exceeded
      if (
        activeSegment.records.length > 0 &&
        activeSegment.sizeBytes + recordBytes > this.maxSegmentSizeBytes
      ) {
        activeSegment.closed = true;
        activeSegment = {
          baseOffset: currentOffset,
          records: [],
          sizeBytes: 0,
          closed: false,
        };
        this.segments.push(activeSegment);
      }

      const record: LogRecord = {
        offset: currentOffset,
        key: input.key ?? null,
        value: input.value,
        timestamp: input.timestamp,
        leaderEpoch: input.leaderEpoch ?? 0,
        sizeBytes: recordBytes,
      };

      activeSegment.records.push(record);
      activeSegment.sizeBytes += recordBytes;
      bytesAppended += recordBytes;
      currentOffset += 1;
    }

    const lastOffset = currentOffset - 1;
    return {
      firstOffset,
      lastOffset,
      logEndOffset: currentOffset,
      bytesAppended,
    };
  }

  /**
   * Fetches records starting from the specified offset up to maxRecords limit.
   */
  public fetch(startOffset: number, maxRecords: number = 50): FetchResult {
    const records: LogRecord[] = [];

    for (const segment of this.segments) {
      for (const rec of segment.records) {
        if (rec.offset >= startOffset && records.length < maxRecords) {
          records.push(rec);
        }
      }
    }

    return {
      records,
      highWatermark: this._highWatermark,
      logEndOffset: this.logEndOffset,
    };
  }

  /**
   * Truncates log back to the specified target offset (e.g. for replica reconciliation).
   */
  public truncate(targetOffset: number): void {
    const remainingSegments: LogSegment[] = [];

    for (const segment of this.segments) {
      if (segment.baseOffset >= targetOffset) {
        // Drop entirely
        continue;
      }

      segment.records = segment.records.filter((r) => r.offset < targetOffset);
      segment.sizeBytes = segment.records.reduce((sum, r) => sum + r.sizeBytes, 0);
      segment.closed = false;
      remainingSegments.push(segment);
    }

    if (remainingSegments.length === 0) {
      remainingSegments.push({
        baseOffset: targetOffset,
        records: [],
        sizeBytes: 0,
        closed: false,
      });
    }

    this.segments = remainingSegments;
    if (this._highWatermark > targetOffset) {
      this._highWatermark = targetOffset;
    }
  }

  /**
   * Updates the High-Watermark (committed replication boundary).
   */
  public setHighWatermark(hw: number): void {
    if (hw < this._highWatermark) {
      throw new Error(
        `High-watermark cannot decrease monotonically: current=${this._highWatermark}, target=${hw}`,
      );
    }
    const maxLeo = this.logEndOffset;
    if (hw > maxLeo) {
      throw new Error(
        `High-watermark cannot exceed logEndOffset: HW=${hw}, LEO=${maxLeo}`,
      );
    }
    this._highWatermark = hw;
  }

  public get highWatermark(): number {
    return this._highWatermark;
  }

  public get logEndOffset(): number {
    const active = this.activeSegment;
    if (active.records.length === 0) {
      return active.baseOffset;
    }
    const lastRecord = active.records[active.records.length - 1]!;
    return lastRecord.offset + 1;
  }

  public get logStartOffset(): number {
    const first = this.segments[0];
    return first ? first.baseOffset : 0;
  }

  public get totalSizeBytes(): number {
    return this.segments.reduce((sum, s) => sum + s.sizeBytes, 0);
  }

  public get segmentCount(): number {
    return this.segments.length;
  }

  private get activeSegment(): LogSegment {
    return this.segments[this.segments.length - 1]!;
  }
}
