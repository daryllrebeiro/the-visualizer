export interface SequenceMessage {
  sequence: number;
  payload: any;
  timestamp: number;
}

export class SequenceReconciler {
  // Map containing room updates buffer: roomId -> SequenceMessage[]
  private roomBuffers = new Map<string, SequenceMessage[]>();
  // Map containing next sequence number: roomId -> number
  private roomSequences = new Map<string, number>();

  private readonly maxBufferSize = 50;

  /**
   * Assigns a sequence number to a room message, buffers it, and returns the sequence.
   */
  public bufferMessage(roomId: string, payload: any): number {
    const nextSeq = this.roomSequences.get(roomId) ?? 1;
    this.roomSequences.set(roomId, nextSeq + 1);

    const message: SequenceMessage = {
      sequence: nextSeq,
      payload,
      timestamp: Date.now(),
    };

    let buffer = this.roomBuffers.get(roomId);
    if (!buffer) {
      buffer = [];
      this.roomBuffers.set(roomId, buffer);
    }

    buffer.push(message);

    // Evict oldest updates if limit exceeded
    if (buffer.length > this.maxBufferSize) {
      buffer.shift();
    }

    return nextSeq;
  }

  /**
   * Retrieves missing messages starting from the given sequence number.
   * Returns an array of updates if they are fully available in the buffer,
   * otherwise returns null (indicating a full snapshot sync is required).
   */
  public recoverGap(roomId: string, fromSequence: number): any[] | null {
    const buffer = this.roomBuffers.get(roomId) ?? [];
    if (buffer.length === 0) return null;

    const firstSeq = buffer[0]?.sequence;
    const lastSeq = buffer[buffer.length - 1]?.sequence;

    if (firstSeq === undefined || lastSeq === undefined) return null;

    // If the requested sequence is older than the oldest message in our buffer,
    // we cannot recover from the buffer (overrun) -> trigger full snapshot.
    if (fromSequence < firstSeq) {
      return null;
    }

    // Filter and retrieve missing updates
    return buffer.filter((m) => m.sequence >= fromSequence).map((m) => m.payload);
  }

  /**
   * Resets room sequence buffers on session teardown.
   */
  public clearRoom(roomId: string): void {
    this.roomBuffers.delete(roomId);
    this.roomSequences.delete(roomId);
  }
}

export const sequenceReconciler = new SequenceReconciler();
