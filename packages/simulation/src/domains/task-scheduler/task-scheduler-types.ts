/**
 * Distributed Task Scheduler & Cron — simulation types.
 *
 * Chronos/Airflow-style distributed scheduling: leader-elected
 * dispatcher holding a lease (semantics mirroring /distributed-lock),
 * exactly-once job dispatch via idempotency keys, retries with
 * exponential backoff and jitter (Brooker 2015), and DAG dependency
 * ordering.
 *
 * References:
 * - Apache Airflow scheduler docs (DAG scheduling, retry policy)
 * - Chronos-style fault-tolerant cron
 * - Vixie cron expression semantics (interval form)
 * - Brooker (2015, AWS Architecture Blog): Exponential Backoff and Jitter
 *   (full jitter vs equal jitter vs no jitter)
 * - Kleppmann, DDIA ch. 8 — idempotency / exactly-once framing
 */

export type RetryJitterMode = 'NONE' | 'EQUAL' | 'FULL';

export interface RetryPolicy {
  /** base delay in ticks for the first retry */
  base: number;
  /** multiplier per attempt (exponential backoff) */
  multiplier: number;
  maxAttempts: number;
  jitter: RetryJitterMode;
  maxBackoff: number;
}

export interface CronJobDef {
  id: string;
  /** fire every N ticks (interval cron form) */
  every: number;
  retry: RetryPolicy;
  lastFireTick: number;
}

export interface DagTaskDef {
  id: string;
  /** upstream task ids (must all reach SUCCESS before this task starts) */
  upstream: string[];
  durationTicks: number;
  /** deterministic failure injection: this attempt (1-based) fails */
  failOnAttempt: number | null;
}

export interface DagDef {
  id: string;
  tasks: DagTaskDef[];
  /** retry policy applied to every task in the DAG (SCHED-4) */
  retry: RetryPolicy;
}

export type DagTaskStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'SUCCESS'
  | 'FAILED_TERMINAL'
  | 'RETRYING'
  | 'SKIPPED_UPSTREAM_FAILED';

export interface DagRunTask {
  id: string;
  status: DagTaskStatus;
  attemptCount: number;
  startTick: number | null;
  nextRetryTick: number | null;
  /** actual recorded retry delays (SCHED-4 evidence) */
  retryDelays: number[];
}

export interface DagRunState {
  runId: string;
  dagId: string;
  startTick: number;
  tasks: Record<string, DagRunTask>;
  state: 'RUNNING' | 'SUCCEEDED' | 'FAILED';
}

export interface DispatchRecord {
  idempotencyKey: string;
  jobId: string;
  fireTick: number;
  dispatchedTick: number;
  dispatchedBy: string;
}

export interface DispatchAttempt {
  idempotencyKey: string;
  jobId: string;
  fireTick: number;
  tick: number;
  by: string;
  accepted: boolean;
  reason: string;
}

export interface SchedulerNode {
  id: string;
  online: boolean;
  isLeader: boolean;
  leaseExpireTick: number;
}

export interface TaskSchedulerClusterState {
  clusterId: string;
  tick: number;
  rngState?: number;
  schedulers: Record<string, SchedulerNode>;
  schedulerOrder: string[];
  currentLeader: string | null;
  leaseDurationTicks: number;
  jobs: Record<string, CronJobDef>;
  jobOrder: string[];
  dags: Record<string, DagDef>;
  dagOrder: string[];
  dagRuns: Record<string, DagRunState>;
  dagRunOrder: string[];
  /** idempotency key -> dispatch record (SCHED-2 exactly-once) */
  dispatchLog: Record<string, DispatchRecord>;
  dispatchOrder: string[];
  /** recent dispatch attempts incl. rejections (SCHED-1/SCHED-2 evidence) */
  dispatchAttempts: DispatchAttempt[];
  stats: {
    dispatches: number;
    dedupRejections: number;
    leaseRejections: number;
    failedTasks: number;
    retriedTasks: number;
    terminalFailedTasks: number;
    skippedTasks: number;
    leaderFailovers: number;
  };
}

export type TaskSchedulerSimEvent =
  | { id: string; tick: number; type: 'SCHED_TICK'; payload: Record<string, unknown> }
  | { id: string; tick: number; type: 'SCHED_DECLARE_JOB'; payload: { jobId: string; every: number; retry?: Partial<RetryPolicy> } }
  | {
      id: string;
      tick: number;
      type: 'SCHED_DECLARE_DAG';
      payload: { dagId: string; tasks: Array<{ id: string; upstream: string[]; durationTicks: number; failOnAttempt?: number | null }>; retry?: Partial<RetryPolicy> };
    }
  | { id: string; tick: number; type: 'SCHED_RUN_DAG'; payload: { dagId: string } }
  | { id: string; tick: number; type: 'SCHED_TRIGGER_JOB'; payload: { jobId: string; fireTick?: number } }
  | { id: string; tick: number; type: 'SCHED_KILL_SCHEDULER'; payload: { schedulerId: string } }
  | { id: string; tick: number; type: 'SCHED_REVIVE_SCHEDULER'; payload: { schedulerId: string } }
  | { id: string; tick: number; type: 'SCHED_ATTEMPT_ACQUIRE'; payload: { schedulerId: string } }
  | { id: string; tick: number; type: 'SCHED_ATTEMPT_DISPATCH'; payload: { schedulerId: string; jobId: string; fireTick: number } }
  | { id: string; tick: number; type: 'SCHED_INJECT_TASK_FAILURE'; payload: { runId: string; taskId: string; failOnAttempt: number } };

/** Resource caps (hard-clamped; surfaced in UI when hit). */
export const SCHED_CAPS = {
  maxJobs: 100,
  maxDagRuns: 20,
  maxDagTasks: 20,
  maxDagDepth: 8,
  maxDispatchLog: 5_000,
  maxDispatchAttempts: 200,
  maxRetries: 5,
} as const;
