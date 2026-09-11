import { Worker } from 'node:worker_threads';

import type { TickJob, TickResult } from './tick-worker.js';

interface PendingJob {
  job: TickJob;
  resolve: (result: TickResult) => void;
  reject: (error: Error) => void;
}

/**
 * Small worker-thread pool for pure tick reductions.
 *
 * Purpose: keep the gateway's event loop responsive when one room's reducer is
 * expensive, so heartbeats and framing for every other room are not blocked by
 * the slowest tenant. The pool is opt-in (`ENABLE_TICK_WORKERS=1`); the runner
 * always has an inline fallback, so a worker failure degrades performance, not
 * correctness.
 */
export class TickWorkerPool {
  private readonly workers: Worker[] = [];
  private readonly idle: Worker[] = [];
  private readonly queue: PendingJob[] = [];
  private readonly inFlight = new Map<Worker, PendingJob>();
  private closed = false;

  constructor(size = 2, workerUrl?: URL) {
    const url = workerUrl ?? new URL('./tick-worker.js', import.meta.url);
    for (let i = 0; i < Math.max(1, size); i++) {
      const worker = new Worker(url);
      worker.on('message', (result: TickResult) => this.handleResult(worker, result));
      worker.on('error', (err) => this.handleFailure(worker, err));
      this.workers.push(worker);
      this.idle.push(worker);
    }
  }

  public get size(): number {
    return this.workers.length;
  }

  public run(job: Omit<TickJob, 'jobId'>): Promise<TickResult> {
    if (this.closed) return Promise.reject(new Error('TickWorkerPool is closed'));
    const fullJob: TickJob = { ...job, jobId: this.nextJobId++ };
    return new Promise<TickResult>((resolve, reject) => {
      const worker = this.idle.pop();
      if (!worker) {
        this.queue.push({ job: fullJob, resolve, reject });
        return;
      }
      this.dispatch(worker, { job: fullJob, resolve, reject });
    });
  }

  private nextJobId = 1;

  private dispatch(worker: Worker, pending: PendingJob): void {
    this.inFlight.set(worker, pending);
    worker.postMessage(pending.job);
  }

  private handleResult(worker: Worker, result: TickResult): void {
    const pending = this.inFlight.get(worker);
    if (pending) {
      this.inFlight.delete(worker);
      if (result.error) pending.reject(new Error(result.error));
      else pending.resolve(result);
    }
    this.release(worker);
  }

  private handleFailure(worker: Worker, err: Error): void {
    const pending = this.inFlight.get(worker);
    if (pending) {
      this.inFlight.delete(worker);
      pending.reject(err);
    }
    this.release(worker);
  }

  private release(worker: Worker): void {
    const next = this.queue.shift();
    if (next) {
      this.dispatch(worker, next);
      return;
    }
    this.idle.push(worker);
  }

  public async close(): Promise<void> {
    this.closed = true;
    for (const pending of this.inFlight.values()) pending.reject(new Error('TickWorkerPool closed'));
    this.inFlight.clear();
    for (const pending of this.queue) pending.reject(new Error('TickWorkerPool closed'));
    this.queue.length = 0;
    await Promise.all(this.workers.map((w) => w.terminate()));
    this.workers.length = 0;
    this.idle.length = 0;
  }
}
