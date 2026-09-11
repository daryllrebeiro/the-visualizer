import type { DeterministicRNG } from '../../prng/deterministic-rng.js';
import {
  SCHED_CAPS,
  type CronJobDef,
  type DagDef,
  type DagRunState,
  type DagRunTask,
  type DagTaskDef,
  type DispatchAttempt,
  type RetryPolicy,
  type TaskSchedulerClusterState,
  type TaskSchedulerSimEvent,
} from './task-scheduler-types.js';

const DEFAULT_RETRY: RetryPolicy = {
  base: 2,
  multiplier: 2,
  maxAttempts: 3,
  jitter: 'FULL',
  maxBackoff: 32,
};

const DEFAULT_DAG: DagDef = {
  id: 'etl-pipeline',
  retry: { ...DEFAULT_RETRY },
  tasks: [
    { id: 'extract', upstream: [], durationTicks: 2, failOnAttempt: null },
    { id: 'transform', upstream: ['extract'], durationTicks: 3, failOnAttempt: null },
    { id: 'validate', upstream: ['extract'], durationTicks: 2, failOnAttempt: null },
    { id: 'load', upstream: ['transform', 'validate'], durationTicks: 2, failOnAttempt: null },
  ],
};

export function createDefaultTaskSchedulerCluster(
  clusterId = 'task-scheduler-1',
): TaskSchedulerClusterState {
  const schedulers: Record<string, TaskSchedulerClusterState['schedulers'][string]> = {
    'scheduler-1': { id: 'scheduler-1', online: true, isLeader: true, leaseExpireTick: 5 },
    'scheduler-2': { id: 'scheduler-2', online: true, isLeader: false, leaseExpireTick: -1 },
    'scheduler-3': { id: 'scheduler-3', online: true, isLeader: false, leaseExpireTick: -1 },
  };
  const jobs: Record<string, CronJobDef> = {
    'job-report': { id: 'job-report', every: 10, retry: { ...DEFAULT_RETRY }, lastFireTick: 0 },
    'job-cleanup': { id: 'job-cleanup', every: 15, retry: { ...DEFAULT_RETRY }, lastFireTick: 0 },
  };
  return {
    clusterId,
    tick: 0,
    schedulers,
    schedulerOrder: ['scheduler-1', 'scheduler-2', 'scheduler-3'],
    currentLeader: 'scheduler-1',
    leaseDurationTicks: 5,
    jobs,
    jobOrder: ['job-report', 'job-cleanup'],
    dags: { [DEFAULT_DAG.id]: DEFAULT_DAG },
    dagOrder: [DEFAULT_DAG.id],
    dagRuns: {},
    dagRunOrder: [],
    dispatchLog: {},
    dispatchOrder: [],
    dispatchAttempts: [],
    stats: {
      dispatches: 0,
      dedupRejections: 0,
      leaseRejections: 0,
      failedTasks: 0,
      retriedTasks: 0,
      terminalFailedTasks: 0,
      skippedTasks: 0,
      leaderFailovers: 0,
    },
  };
}

/** Exponential backoff with jitter, per Brooker (2015). */
export function computeBackoffDelay(
  policy: RetryPolicy,
  failureNumber: number,
  rng: DeterministicRNG,
): number {
  const raw = Math.min(policy.maxBackoff, policy.base * Math.pow(policy.multiplier, failureNumber));
  switch (policy.jitter) {
    case 'NONE':
      return raw;
    case 'EQUAL':
      // delay/2 + uniform[0, delay/2] — never below half the backoff.
      return Math.floor(raw / 2) + rng.nextInt(0, Math.max(0, Math.floor(raw / 2)));
    case 'FULL':
      // uniform[0, delay].
      return rng.nextInt(0, raw);
  }
}

function leaseHeldBy(state: TaskSchedulerClusterState, schedulerId: string): boolean {
  const node = state.schedulers[schedulerId];
  return Boolean(node && node.isLeader && node.online && node.leaseExpireTick > state.tick);
}

function dispatchJob(
  state: TaskSchedulerClusterState,
  jobId: string,
  fireTick: number,
  bySchedulerId: string,
): void {
  const idempotencyKey = `${jobId}@${fireTick}`;
  const attempt: DispatchAttempt = {
    idempotencyKey,
    jobId,
    fireTick,
    tick: state.tick,
    by: bySchedulerId,
    accepted: false,
    reason: '',
  };

  // SCHED-1: dispatch requires holding an unexpired lease.
  if (!leaseHeldBy(state, bySchedulerId)) {
    state.stats.leaseRejections++;
    attempt.reason = `scheduler ${bySchedulerId} does not hold an unexpired dispatch lease`;
    state.dispatchAttempts.push(attempt);
    trimAttempts(state);
    return;
  }

  // SCHED-2: exactly-once via idempotency key dedup.
  if (state.dispatchLog[idempotencyKey] !== undefined) {
    state.stats.dedupRejections++;
    attempt.reason = `idempotency key ${idempotencyKey} already dispatched (dedup hit)`;
    state.dispatchAttempts.push(attempt);
    trimAttempts(state);
    return;
  }

  state.dispatchLog[idempotencyKey] = {
    idempotencyKey,
    jobId,
    fireTick,
    dispatchedTick: state.tick,
    dispatchedBy: bySchedulerId,
  };
  state.dispatchOrder.push(idempotencyKey);
  if (state.dispatchOrder.length > SCHED_CAPS.maxDispatchLog) {
    const oldest = state.dispatchOrder.shift();
    if (oldest) delete state.dispatchLog[oldest];
  }
  state.stats.dispatches++;
  attempt.accepted = true;
  attempt.reason = `dispatched by ${bySchedulerId}`;
  state.dispatchAttempts.push(attempt);
  trimAttempts(state);
}

function trimAttempts(state: TaskSchedulerClusterState): void {
  if (state.dispatchAttempts.length > SCHED_CAPS.maxDispatchAttempts) {
    state.dispatchAttempts.shift();
  }
}

function startDagRun(state: TaskSchedulerClusterState, dagId: string, rng: DeterministicRNG): void {
  const dag = state.dags[dagId];
  if (!dag) return;
  if (Object.keys(state.dagRuns).length >= SCHED_CAPS.maxDagRuns) return;
  const runId = `run-${dagId}-${state.dagRunOrder.length + 1}`;
  const tasks: Record<string, DagRunTask> = {};
  for (const task of dag.tasks) {
    tasks[task.id] = {
      id: task.id,
      status: 'PENDING',
      attemptCount: 0,
      startTick: null,
      nextRetryTick: null,
      retryDelays: [],
    };
  }
  state.dagRuns[runId] = { runId, dagId, startTick: state.tick, tasks, state: 'RUNNING' };
  state.dagRunOrder.push(runId);
  void rng;
}

function upstreamAllSuccess(run: DagRunState, task: DagTaskDef): boolean {
  return task.upstream.every((up) => run.tasks[up]?.status === 'SUCCESS');
}

function anyUpstreamFailed(run: DagRunState, task: DagTaskDef): boolean {
  return task.upstream.some(
    (up) => run.tasks[up]?.status === 'FAILED_TERMINAL' || run.tasks[up]?.status === 'SKIPPED_UPSTREAM_FAILED',
  );
}

function propagateSkips(run: DagRunState, dag: DagDef): void {
  // Transitively mark downstream tasks of terminal failures as skipped.
  let changed = true;
  while (changed) {
    changed = false;
    for (const task of dag.tasks) {
      const runTask = run.tasks[task.id];
      if (!runTask || runTask.status !== 'PENDING') continue;
      if (anyUpstreamFailed(run, task)) {
        runTask.status = 'SKIPPED_UPSTREAM_FAILED';
        changed = true;
      }
    }
  }
}

function stepDagRuns(state: TaskSchedulerClusterState, rng: DeterministicRNG): void {
  for (const runId of [...state.dagRunOrder]) {
    const run = state.dagRuns[runId];
    if (!run || run.state !== 'RUNNING') continue;
    const dag = state.dags[run.dagId];
    if (!dag) continue;

    for (const task of dag.tasks) {
      const runTask = run.tasks[task.id];
      if (!runTask) continue;

      if (runTask.status === 'PENDING' && upstreamAllSuccess(run, task)) {
        // SCHED-3: start only when every upstream dependency succeeded.
        runTask.status = 'RUNNING';
        runTask.attemptCount += 1;
        runTask.startTick = state.tick;
      } else if (runTask.status === 'RUNNING' && runTask.startTick !== null) {
        if (state.tick - runTask.startTick >= task.durationTicks) {
          if (task.failOnAttempt !== null && runTask.attemptCount >= task.failOnAttempt) {
            // This attempt fails deterministically.
            if (runTask.attemptCount < dag.retry.maxAttempts) {
              const failureNumber = runTask.attemptCount - 1; // 0-based
              const delay = computeBackoffDelay(dag.retry, failureNumber, rng);
              runTask.retryDelays.push(delay);
              runTask.status = 'RETRYING';
              runTask.nextRetryTick = state.tick + delay;
              state.stats.retriedTasks++;
            } else {
              runTask.status = 'FAILED_TERMINAL';
              state.stats.terminalFailedTasks++;
            }
            state.stats.failedTasks++;
          } else {
            runTask.status = 'SUCCESS';
          }
        }
      } else if (runTask.status === 'RETRYING' && runTask.nextRetryTick !== null) {
        if (state.tick >= runTask.nextRetryTick) {
          if (runTask.attemptCount >= dag.retry.maxAttempts) {
            runTask.status = 'FAILED_TERMINAL';
            runTask.nextRetryTick = null;
            state.stats.terminalFailedTasks++;
          } else {
            runTask.status = 'RUNNING';
            runTask.attemptCount += 1;
            runTask.startTick = state.tick;
            runTask.nextRetryTick = null;
          }
        }
      }
    }

    propagateSkips(run, dag);

    // Run-level state.
    const runTasks = Object.values(run.tasks);
    if (runTasks.every((t) => t.status === 'SUCCESS')) {
      run.state = 'SUCCEEDED';
    } else if (runTasks.some((t) => t.status === 'FAILED_TERMINAL')) {
      // Terminal failure only finalizes once downstream skips settle.
      run.state = 'FAILED';
    }
  }
}

function expireAndElect(state: TaskSchedulerClusterState): void {
  // Expire dead leases.
  for (const node of Object.values(state.schedulers)) {
    if (node.isLeader && (!node.online || node.leaseExpireTick <= state.tick)) {
      node.isLeader = false;
      if (state.currentLeader === node.id) {
        state.currentLeader = null;
      }
    }
  }
  // Election: first online non-leader acquires (deterministic order).
  if (state.currentLeader === null) {
    for (const id of state.schedulerOrder) {
      const node = state.schedulers[id];
      if (node && node.online && !node.isLeader) {
        node.isLeader = true;
        node.leaseExpireTick = state.tick + state.leaseDurationTicks;
        state.currentLeader = id;
        state.stats.leaderFailovers++;
        break;
      }
    }
  } else {
    // Leader renews its lease.
    const leader = state.schedulers[state.currentLeader];
    if (leader && leader.online) {
      leader.leaseExpireTick = state.tick + state.leaseDurationTicks;
    }
  }
}

function fireCronJobs(state: TaskSchedulerClusterState): void {
  // Simultaneous triggers dispatch in stable job-id order.
  for (const jobId of state.jobOrder) {
    const job = state.jobs[jobId];
    if (!job) continue;
    if (state.tick - job.lastFireTick >= job.every && state.tick > 0) {
      job.lastFireTick = state.tick;
      if (state.currentLeader) {
        dispatchJob(state, jobId, state.tick, state.currentLeader);
      }
    }
  }
}

export function pureTaskSchedulerTransition(
  state: TaskSchedulerClusterState,
  event: TaskSchedulerSimEvent,
  rng: DeterministicRNG,
): { nextState: TaskSchedulerClusterState; emittedEvents: TaskSchedulerSimEvent[] } {
  const nextState: TaskSchedulerClusterState = JSON.parse(
    JSON.stringify(state),
  ) as TaskSchedulerClusterState;
  nextState.tick = event.tick;

  switch (event.type) {
    case 'SCHED_DECLARE_JOB': {
      if (Object.keys(nextState.jobs).length >= SCHED_CAPS.maxJobs) break;
      const jobId = event.payload.jobId;
      if (nextState.jobs[jobId] !== undefined) break;
      nextState.jobs[jobId] = {
        id: jobId,
        every: Math.max(1, event.payload.every),
        retry: { ...DEFAULT_RETRY, ...event.payload.retry },
        lastFireTick: 0,
      };
      nextState.jobOrder.push(jobId);
      break;
    }

    case 'SCHED_DECLARE_DAG': {
      const dagId = event.payload.dagId;
      if (nextState.dags[dagId] !== undefined) break;
      if (event.payload.tasks.length === 0 || event.payload.tasks.length > SCHED_CAPS.maxDagTasks) break;
      const retry: RetryPolicy = { ...DEFAULT_RETRY, ...event.payload.retry };
      nextState.dags[dagId] = {
        id: dagId,
        retry,
        tasks: event.payload.tasks.map((t) => ({
          id: t.id,
          upstream: [...t.upstream],
          durationTicks: Math.max(1, t.durationTicks),
          failOnAttempt: t.failOnAttempt ?? null,
        })),
      };
      nextState.dagOrder.push(dagId);
      break;
    }

    case 'SCHED_RUN_DAG': {
      startDagRun(nextState, event.payload.dagId, rng);
      break;
    }

    case 'SCHED_TRIGGER_JOB': {
      const jobId = event.payload.jobId;
      const fireTick = event.payload.fireTick ?? nextState.tick;
      if (!nextState.jobs[jobId]) break;
      const by = nextState.currentLeader ?? 'nobody';
      dispatchJob(nextState, jobId, fireTick, by);
      break;
    }

    case 'SCHED_KILL_SCHEDULER': {
      const node = nextState.schedulers[event.payload.schedulerId];
      if (node) {
        node.online = false;
      }
      break;
    }

    case 'SCHED_REVIVE_SCHEDULER': {
      const node = nextState.schedulers[event.payload.schedulerId];
      if (node) {
        node.online = true;
      }
      break;
    }

    case 'SCHED_ATTEMPT_ACQUIRE': {
      const node = nextState.schedulers[event.payload.schedulerId];
      if (!node || !node.online) break;
      if (nextState.currentLeader === null || !leaseHeldBy(nextState, nextState.currentLeader)) {
        // Only acquire when no live lease exists (SCHED-1).
        if (nextState.currentLeader !== null) {
          const stale = nextState.schedulers[nextState.currentLeader];
          if (stale) stale.isLeader = false;
          nextState.currentLeader = null;
        }
        node.isLeader = true;
        node.leaseExpireTick = nextState.tick + nextState.leaseDurationTicks;
        nextState.currentLeader = node.id;
        nextState.stats.leaderFailovers++;
      }
      break;
    }

    case 'SCHED_ATTEMPT_DISPATCH': {
      // Split-brain probe: an arbitrary scheduler attempts to dispatch —
      // rejected unless it holds the live lease (SCHED-1), deduped
      // otherwise (SCHED-2).
      if (!nextState.jobs[event.payload.jobId]) break;
      dispatchJob(nextState, event.payload.jobId, event.payload.fireTick, event.payload.schedulerId);
      break;
    }

    case 'SCHED_INJECT_TASK_FAILURE': {
      const run = nextState.dagRuns[event.payload.runId];
      const dag = run ? nextState.dags[run.dagId] : undefined;
      const task = dag?.tasks.find((t) => t.id === event.payload.taskId);
      if (run && task) {
        task.failOnAttempt = Math.max(1, event.payload.failOnAttempt);
      }
      break;
    }

    case 'TICK' as any:
    case 'SCHED_TICK': {
      expireAndElect(nextState);
      fireCronJobs(nextState);
      stepDagRuns(nextState, rng);
      break;
    }
  }

  nextState.rngState = rng.getState();
  return { nextState, emittedEvents: [] };
}
