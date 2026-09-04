/**
 * packages/simulation/src/domain/storage-adapter.ts
 *
 * In-memory persistence adapter interface for partition logs.
 * Zero external I/O dependencies.
 */
import { PartitionLog, type PartitionLogOptions } from './partition-log.js';

export interface StorageAdapter {
  getPartitionLog(topic: string, partition: number): PartitionLog;
  hasPartitionLog(topic: string, partition: number): boolean;
  createPartitionLog(topic: string, partition: number, options?: PartitionLogOptions): PartitionLog;
  deletePartitionLog(topic: string, partition: number): boolean;
  clear(): void;
  getAllLogs(): PartitionLog[];
}

export class InMemoryStorageAdapter implements StorageAdapter {
  private logs = new Map<string, PartitionLog>();

  private makeKey(topic: string, partition: number): string {
    return `${topic}:${String(partition)}`;
  }

  public getPartitionLog(topic: string, partition: number): PartitionLog {
    const key = this.makeKey(topic, partition);
    const log = this.logs.get(key);
    if (!log) {
      throw new Error(`PartitionLog not found for topic "${topic}", partition ${partition}`);
    }
    return log;
  }

  public hasPartitionLog(topic: string, partition: number): boolean {
    return this.logs.has(this.makeKey(topic, partition));
  }

  public createPartitionLog(
    topic: string,
    partition: number,
    options?: PartitionLogOptions,
  ): PartitionLog {
    const key = this.makeKey(topic, partition);
    if (this.logs.has(key)) {
      throw new Error(`PartitionLog already exists for topic "${topic}", partition ${partition}`);
    }
    const log = new PartitionLog(topic, partition, options);
    this.logs.set(key, log);
    return log;
  }

  public deletePartitionLog(topic: string, partition: number): boolean {
    const key = this.makeKey(topic, partition);
    return this.logs.delete(key);
  }

  public clear(): void {
    this.logs.clear();
  }

  public getAllLogs(): PartitionLog[] {
    return Array.from(this.logs.values());
  }
}
