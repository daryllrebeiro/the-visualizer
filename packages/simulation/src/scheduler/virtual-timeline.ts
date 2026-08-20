/**
 * Virtual Timestamp — discrete integer ticks, never wall-clock time.
 *
 * All simulation scheduling uses VirtualTimestamp.
 * The simulation engine NEVER calls Date.now() or performance.now().
 */
export type VirtualTimestamp = number;

/**
 * A scheduled event in the virtual timeline.
 * T is the event payload type (e.g., KafkaSimEvent).
 */
export interface ScheduledEvent<T> {
  /** When to execute this event (virtual ticks) */
  readonly scheduledAt: VirtualTimestamp;
  /** Unique event ID for deduplication and logging */
  readonly id: string;
  /** Event payload — what to do */
  readonly payload: T;
}

/**
 * Min-heap based virtual timeline.
 *
 * Semantics:
 *   - peek() returns the next event without removing it
 *   - pop() removes and returns the next event
 *   - schedule() inserts an event at a future tick
 *   - currentTick advances to the next event's scheduledAt on pop()
 */
export class VirtualTimeline<T> {
  private readonly heap: ScheduledEvent<T>[] = [];
  private _currentTick: VirtualTimestamp = 0;

  get currentTick(): VirtualTimestamp {
    return this._currentTick;
  }
  public restoreTick(tick: VirtualTimestamp): void {
    this._currentTick = tick;
  }

  get size(): number {
    return this.heap.length;
  }

  get isEmpty(): boolean {
    return this.heap.length === 0;
  }

  /** Schedule an event at a future tick (must be >= currentTick) */
  public schedule(event: ScheduledEvent<T>): void {
    if (event.scheduledAt < this._currentTick) {
      throw new Error(
        `Cannot schedule event at tick ${String(event.scheduledAt)}: current tick is ${String(this._currentTick)}`,
      );
    }
    this.heap.push(event);
    this.bubbleUp(this.heap.length - 1);
  }

  /** Peek at the next event without advancing the timeline */
  public peek(): ScheduledEvent<T> | undefined {
    return this.heap[0];
  }

  /** Pop the next event and advance currentTick */
  public pop(): ScheduledEvent<T> | undefined {
    if (this.heap.length === 0) return undefined;

    const next = this.heap[0];
    if (next === undefined) return undefined;
    this._currentTick = next.scheduledAt;

    const last = this.heap.pop();
    if (this.heap.length > 0 && last !== undefined) {
      this.heap[0] = last;
      this.sinkDown(0);
    }

    return next;
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.compare(index, parent) < 0) {
        this.swap(index, parent);
        index = parent;
      } else {
        break;
      }
    }
  }

  private sinkDown(index: number): void {
    const length = this.heap.length;
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    while (true) {
      const left = 2 * index + 1;
      const right = 2 * index + 2;
      let smallest = index;

      if (left < length && this.compare(left, smallest) < 0) smallest = left;
      if (right < length && this.compare(right, smallest) < 0) smallest = right;

      if (smallest !== index) {
        this.swap(index, smallest);
        index = smallest;
      } else {
        break;
      }
    }
  }

  private compare(a: number, b: number): number {
    const eventA = this.heap[a];
    const eventB = this.heap[b];
    if (eventA === undefined || eventB === undefined) return 0;
    return eventA.scheduledAt - eventB.scheduledAt;
  }

  private swap(a: number, b: number): void {
    const itemA = this.heap[a];
    const itemB = this.heap[b];
    if (itemA !== undefined && itemB !== undefined) {
      this.heap[a] = itemB;
      this.heap[b] = itemA;
    }
  }
}
