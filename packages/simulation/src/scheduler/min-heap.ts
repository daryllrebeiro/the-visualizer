/**
 * MinHeapPriorityQueue — generic min-heap for use outside VirtualTimeline
 * where arbitrary priority ordering is needed.
 */
export class MinHeapPriorityQueue<T> {
  private readonly heap: T[] = [];
  private readonly comparator: (a: T, b: T) => number;

  constructor(comparator: (a: T, b: T) => number) {
    this.comparator = comparator;
  }

  get size(): number {
    return this.heap.length;
  }

  get isEmpty(): boolean {
    return this.heap.length === 0;
  }

  public push(item: T): void {
    this.heap.push(item);
    this.bubbleUp(this.heap.length - 1);
  }

  public peek(): T | undefined {
    return this.heap[0];
  }

  public pop(): T | undefined {
    if (this.heap.length === 0) return undefined;
    const top = this.heap[0] as T;
    const last = this.heap.pop();
    if (this.heap.length > 0 && last !== undefined) {
      this.heap[0] = last;
      this.sinkDown(0);
    }
    return top;
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.comparator(this.heap[index] as T, this.heap[parent] as T) < 0) {
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

      if (left < length && this.comparator(this.heap[left] as T, this.heap[smallest] as T) < 0) {
        smallest = left;
      }
      if (right < length && this.comparator(this.heap[right] as T, this.heap[smallest] as T) < 0) {
        smallest = right;
      }

      if (smallest !== index) {
        this.swap(index, smallest);
        index = smallest;
      } else {
        break;
      }
    }
  }

  private swap(a: number, b: number): void {
    const temp = this.heap[a] as T;
    this.heap[a] = this.heap[b] as T;
    this.heap[b] = temp;
  }
}
