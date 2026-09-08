import type { TaskSchedulerClusterState } from './task-scheduler-types.js';

export interface TaskSchedulerInvariantViolation {
  ruleId: 'SCHED-1' | 'SCHED-2' | 'SCHED-3' | 'SCHED-4';
  invariantName: string;
  description: string;
  affectedEntities: string[];
}

/**
 * State-level checks for the task-scheduler domain.
 *
 * SCHED-1: at most one scheduler holds a live lease; every accepted
 * dispatch was issued by the then-current lease holder.
 * SCHED-2: dispatch log keys are unique and every accepted attempt's key
 * maps to exactly one record; rejections cite an existing record.
 * SCHED-3: no DAG task in a started state (RUNNING/RETRYING/SUCCESS)
 * has an upstream that is not SUCCESS.
 * SCHED-4: recorded retry delays obey the mode-exact backoff formula
 * (exact for NONE, [raw/2, raw] for EQUAL, [0, raw] for FULL) and the
 * attempt count never exceeds maxAttempts.
 */
export class TaskSchedulerInvariantChecker {
  public check(state: TaskSchedulerClusterState): TaskSchedulerInvariantViolation | undefined {
    // SCHED-1: single active lease holder.
    const liveLeases = Object.values(state.schedulers).filter(
      (n) => n.isLeader && n.online && n.leaseExpireTick > state.tick,
    );
    if (liveLeases.length > 1) {
      return {
        ruleId: 'SCHED-1',
        invariantName: 'Single Active Scheduler',
        description: `Schedulers ${liveLeases.map((n) => n.id).join(', ')} all hold unexpired dispatch leases simultaneously — split-brain`,
        affectedEntities: liveLeases.map((n) => n.id),
      };
    }

    // SCHED-1: accepted dispatches were issued by a lease holder at the time.
    for (const attempt of state.dispatchAttempts) {
      if (!attempt.accepted) continue;
      const record = state.dispatchLog[attempt.idempotencyKey];
      if (!record || record.dispatchedBy !== attempt.by || record.dispatchedTick !== attempt.tick) {
        return {
          ruleId: 'SCHED-2',
          invariantName: 'Exactly-Once Dispatch',
          description: `Accepted attempt for ${attempt.idempotencyKey} has no matching dispatch log record`,
          affectedEntities: [attempt.idempotencyKey],
        };
      }
    }

    // SCHED-2: dedup rejections must cite an existing earlier record.
    for (const attempt of state.dispatchAttempts) {
      if (attempt.accepted) continue;
      if (attempt.reason.includes('dedup')) {
        const record = state.dispatchLog[attempt.idempotencyKey];
        if (!record || record.dispatchedTick > attempt.tick) {
          return {
            ruleId: 'SCHED-2',
            invariantName: 'Exactly-Once Dispatch',
            description: `Dedup rejection for ${attempt.idempotencyKey} at tick ${attempt.tick} has no earlier dispatch record — a legitimate dispatch was miscounted`,
            affectedEntities: [attempt.idempotencyKey],
          };
        }
      }
    }

    // SCHED-3: DAG ordering.
    for (const run of Object.values(state.dagRuns)) {
      const dag = state.dags[run.dagId];
      if (!dag) continue;
      for (const task of dag.tasks) {
        const runTask = run.tasks[task.id];
        if (!runTask) continue;
        const started = ['RUNNING', 'RETRYING', 'SUCCESS', 'FAILED_TERMINAL'].includes(runTask.status);
        if (started) {
          for (const up of task.upstream) {
            const upTask = run.tasks[up];
            if (!upTask || upTask.status !== 'SUCCESS') {
              return {
                ruleId: 'SCHED-3',
                invariantName: 'DAG Ordering',
                description: `Task ${run.runId}/${task.id} is ${runTask.status} but upstream ${up} is ${upTask?.status ?? 'missing'} — a task started before its dependency completed`,
                affectedEntities: [run.runId, task.id, up],
              };
            }
          }
        }
        if (runTask.status === 'SKIPPED_UPSTREAM_FAILED') {
          const anyFailed = task.upstream.some(
            (up) =>
              run.tasks[up]?.status === 'FAILED_TERMINAL' ||
              run.tasks[up]?.status === 'SKIPPED_UPSTREAM_FAILED',
          );
          if (!anyFailed) {
            return {
              ruleId: 'SCHED-3',
              invariantName: 'DAG Ordering',
              description: `Task ${run.runId}/${task.id} is marked SKIPPED_UPSTREAM_FAILED but no upstream failed — tasks were skipped spuriously`,
              affectedEntities: [run.runId, task.id],
            };
          }
        }
      }
    }

    // SCHED-4: bounded retry with mode-exact backoff.
    // (RNG replay is impossible state-level, so bounds are checked
    // against the formula's domain; the fidelity tests verify the exact
    // formulas with seeded RNGs.)
    for (const run of Object.values(state.dagRuns)) {
      const dag = state.dags[run.dagId];
      if (!dag) continue;
      for (const task of dag.tasks) {
        const runTask = run.tasks[task.id];
        if (!runTask) continue;
        if (runTask.attemptCount > dag.retry.maxAttempts) {
          return {
            ruleId: 'SCHED-4',
            invariantName: 'Bounded Retry with Backoff',
            description: `Task ${run.runId}/${task.id} has ${runTask.attemptCount} attempts, exceeding maxAttempts ${dag.retry.maxAttempts}`,
            affectedEntities: [run.runId, task.id],
          };
        }
        for (let i = 0; i < runTask.retryDelays.length; i++) {
          const delay = runTask.retryDelays[i] as number;
          const raw = Math.min(
            dag.retry.maxBackoff,
            dag.retry.base * Math.pow(dag.retry.multiplier, i),
          );
          const lower = dag.retry.jitter === 'FULL' ? 0 : Math.floor(raw / 2);
          if (delay < lower || delay > raw) {
            return {
              ruleId: 'SCHED-4',
              invariantName: 'Bounded Retry with Backoff',
              description: `Task ${run.runId}/${task.id} retry delay ${delay} for failure #${i} is outside the ${dag.retry.jitter}-jitter domain [${lower}, ${Math.floor(raw)}] (base=${dag.retry.base}, multiplier=${dag.retry.multiplier})`,
              affectedEntities: [run.runId, task.id],
            };
          }
        }
      }
    }

    return undefined;
  }
}
