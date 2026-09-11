import { parentPort } from 'node:worker_threads';

import { DomainRegistry, DeterministicRNG } from '@the-visualizer/simulation';

/**
 * Tick worker: runs a single pure domain reduction off the gateway event loop.
 *
 * Input/output are structured-cloneable plain objects. RNG state is passed in
 * and returned so the main-thread session remains the source of truth and the
 * determinism guarantee is preserved across the thread boundary.
 */
export interface TickJob {
  jobId: number;
  domainId: string;
  state: unknown;
  event: { id: string; tick: number; type: string; payload: Record<string, unknown> };
  rngState: number;
}

export interface TickResult {
  jobId: number;
  nextState: unknown;
  rngState: number;
  violation: { name: string; description: string } | null;
  durationMs: number;
  error?: string;
}

/** Pure reduction used by both the worker thread and unit tests. */
export function reduceTick(job: TickJob): TickResult {
  const start = performance.now();
  try {
    const plugin = DomainRegistry.get(job.domainId);
    if (!plugin) throw new Error(`Unknown domain: ${job.domainId}`);
    const rng = new DeterministicRNG(0);
    rng.restoreState(job.rngState);

    const result = plugin.reduceState(job.state, job.event, rng);
    const check = plugin.validateInvariants(result.nextState);

    return {
      jobId: job.jobId,
      nextState: result.nextState,
      rngState: rng.getState(),
      violation: check.passed || !check.violation ? null : { ...check.violation },
      durationMs: performance.now() - start,
    };
  } catch (err) {
    return {
      jobId: job.jobId,
      nextState: job.state,
      rngState: job.rngState,
      violation: null,
      durationMs: performance.now() - start,
      error: err instanceof Error ? err.message : 'tick worker failed',
    };
  }
}

const port = parentPort;
if (port) {
  port.on('message', (job: TickJob) => {
    port.postMessage(reduceTick(job));
  });
}
