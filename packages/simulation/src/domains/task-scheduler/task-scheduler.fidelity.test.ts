import { describe, expect, it } from 'vitest';

import { DeterministicRNG } from '../../prng/deterministic-rng.js';
import { TaskSchedulerInvariantChecker } from './task-scheduler-invariants.js';
import {
  computeBackoffDelay,
  createDefaultTaskSchedulerCluster,
  pureTaskSchedulerTransition,
} from './task-scheduler-state-transitions.js';
import type { RetryPolicy, TaskSchedulerClusterState, TaskSchedulerSimEvent } from './task-scheduler-types.js';

function ev(state: TaskSchedulerClusterState, event: TaskSchedulerSimEvent, rng: DeterministicRNG): TaskSchedulerClusterState {
  return pureTaskSchedulerTransition(state, event, rng).nextState;
}

describe('Task Scheduler Domain Fidelity Test Suite', () => {
  it('SCHED-1: split-brain dispatch attempt is rejected — only the lease holder may dispatch', () => {
    const rng = new DeterministicRNG(1);
    let state = createDefaultTaskSchedulerCluster();

    // scheduler-2 (not the leader) attempts to dispatch — lease rejection.
    state = ev(
      state,
      { id: 'sb1', tick: 1, type: 'SCHED_ATTEMPT_DISPATCH', payload: { schedulerId: 'scheduler-2', jobId: 'job-report', fireTick: 1 } },
      rng,
    );
    expect(state.stats.leaseRejections).toBe(1);
    expect(state.stats.dispatches).toBe(0);

    // The actual leader dispatches the same key — accepted.
    state = ev(
      state,
      { id: 'sb2', tick: 1, type: 'SCHED_ATTEMPT_DISPATCH', payload: { schedulerId: 'scheduler-1', jobId: 'job-report', fireTick: 1 } },
      rng,
    );
    expect(state.stats.dispatches).toBe(1);
    expect(state.dispatchLog['job-report@1']?.dispatchedBy).toBe('scheduler-1');

    // A third attempt (dead leader resurrected with stale lease) — rejected.
    state = ev(
      state,
      { id: 'sb3', tick: 1, type: 'SCHED_ATTEMPT_DISPATCH', payload: { schedulerId: 'scheduler-3', jobId: 'job-report', fireTick: 1 } },
      rng,
    );
    expect(state.stats.leaseRejections).toBe(2);
    expect(state.stats.dispatches).toBe(1); // exactly one dispatch ever

    const checker = new TaskSchedulerInvariantChecker();
    expect(checker.check(state)).toBeUndefined();
  });

  it('SCHED-2: exactly-once dispatch survives leader failover with window replay', () => {
    const rng = new DeterministicRNG(2);
    let state = createDefaultTaskSchedulerCluster();

    // Leader dispatches job at fireTick 3 (well within its lease).
    state = ev(
      state,
      { id: 'd1', tick: 3, type: 'SCHED_TRIGGER_JOB', payload: { jobId: 'job-report', fireTick: 3 } },
      rng,
    );
    expect(state.stats.dispatches).toBe(1);

    // Kill the leader mid-flight; lease expires; scheduler-2 takes over.
    state = ev(state, { id: 'kill', tick: 4, type: 'SCHED_KILL_SCHEDULER', payload: { schedulerId: 'scheduler-1' } }, rng);
    for (let t = 5; t <= 12; t++) {
      state = ev(state, { id: `t${t}`, tick: t, type: 'SCHED_TICK', payload: {} }, rng);
    }
    expect(state.currentLeader).toBe('scheduler-2');
    expect(state.stats.leaderFailovers).toBeGreaterThanOrEqual(1);

    // New leader replays the fire window: same idempotency key — dedup hit.
    const dispatchesBeforeReplay = state.stats.dispatches;
    state = ev(
      state,
      { id: 'replay', tick: 13, type: 'SCHED_ATTEMPT_DISPATCH', payload: { schedulerId: 'scheduler-2', jobId: 'job-report', fireTick: 3 } },
      rng,
    );
    // The replayed key was NOT dispatched a second time (the tick-10 cron
    // fire is a different, legitimate key).
    expect(state.stats.dispatches).toBe(dispatchesBeforeReplay);
    expect(state.dispatchLog['job-report@3']?.dispatchedBy).toBe('scheduler-1');
    expect(state.stats.dedupRejections).toBe(1);

    // A genuinely new fire tick dispatches fine.
    state = ev(
      state,
      { id: 'new', tick: 13, type: 'SCHED_TRIGGER_JOB', payload: { jobId: 'job-report', fireTick: 13 } },
      rng,
    );
    expect(state.stats.dispatches).toBe(dispatchesBeforeReplay + 1);

    const checker = new TaskSchedulerInvariantChecker();
    expect(checker.check(state)).toBeUndefined();
  });

  it('SCHED-2: invariant checker catches a forged duplicate dispatch record', () => {
    const rng = new DeterministicRNG(3);
    let state = createDefaultTaskSchedulerCluster();
    state = ev(
      state,
      { id: 'd', tick: 2, type: 'SCHED_TRIGGER_JOB', payload: { jobId: 'job-report', fireTick: 2 } },
      rng,
    );

    // Simulate a double-dispatch bug: two accepted attempts, one record.
    const tampered = JSON.parse(JSON.stringify(state)) as TaskSchedulerClusterState;
    tampered.dispatchAttempts.push({
      idempotencyKey: 'job-report@2',
      jobId: 'job-report',
      fireTick: 2,
      tick: 3,
      by: 'scheduler-1',
      accepted: true,
      reason: 'double dispatch bug',
    });

    const checker = new TaskSchedulerInvariantChecker();
    const violation = checker.check(tampered);
    expect(violation).toBeDefined();
    expect(violation?.ruleId).toBe('SCHED-2');
    expect(violation?.description).toContain('no matching dispatch log record');
  });

  it('SCHED-3: DAG tasks start only after upstream SUCCESS; failure blocks downstream', () => {
    const rng = new DeterministicRNG(4);
    let state = createDefaultTaskSchedulerCluster();
    state = ev(state, { id: 'run', tick: 0, type: 'SCHED_RUN_DAG', payload: { dagId: 'etl-pipeline' } }, rng);

    // Tick 0: only extract (no upstream) starts.
    state = ev(state, { id: 't0', tick: 0, type: 'SCHED_TICK', payload: {} }, rng);
    expect(state.dagRuns['run-etl-pipeline-1']!.tasks['extract']!.status).toBe('RUNNING');
    expect(state.dagRuns['run-etl-pipeline-1']!.tasks['transform']!.status).toBe('PENDING');

    // extract finishes at tick 2; transform + validate start.
    state = ev(state, { id: 't1', tick: 1, type: 'SCHED_TICK', payload: {} }, rng);
    state = ev(state, { id: 't2', tick: 2, type: 'SCHED_TICK', payload: {} }, rng);
    expect(state.dagRuns['run-etl-pipeline-1']!.tasks['extract']!.status).toBe('SUCCESS');
    expect(state.dagRuns['run-etl-pipeline-1']!.tasks['transform']!.status).toBe('RUNNING');
    expect(state.dagRuns['run-etl-pipeline-1']!.tasks['validate']!.status).toBe('RUNNING');
    expect(state.dagRuns['run-etl-pipeline-1']!.tasks['load']!.status).toBe('PENDING');

    const checker = new TaskSchedulerInvariantChecker();
    expect(checker.check(state)).toBeUndefined();
  });

  it('SCHED-3: injected failure retries then terminally fails, downstream transitively skipped', () => {
    const rng = new DeterministicRNG(5);
    let state = createDefaultTaskSchedulerCluster();

    // Run the pipeline with transform failing on every attempt
    // (maxAttempts = 3 -> 2 retries then terminal failure).
    state = ev(state, { id: 'run', tick: 0, type: 'SCHED_RUN_DAG', payload: { dagId: 'etl-pipeline' } }, rng);
    state = ev(
      state,
      { id: 'fail', tick: 0, type: 'SCHED_INJECT_TASK_FAILURE', payload: { runId: 'run-etl-pipeline-1', taskId: 'transform', failOnAttempt: 1 } },
      rng,
    );

    let ticks = 0;
    while (state.dagRuns['run-etl-pipeline-1']!.state === 'RUNNING' && ticks < 100) {
      ticks++;
      state = ev(state, { id: `t${ticks}`, tick: ticks, type: 'SCHED_TICK', payload: {} }, rng);
    }

    const run = state.dagRuns['run-etl-pipeline-1']!;
    expect(run.tasks['transform']!.status).toBe('FAILED_TERMINAL');
    expect(run.tasks['transform']!.attemptCount).toBe(3); // maxAttempts
    expect(run.tasks['load']!.status).toBe('SKIPPED_UPSTREAM_FAILED');
    // validate still succeeds (independent branch).
    expect(run.tasks['validate']!.status).toBe('SUCCESS');
    expect(run.state).toBe('FAILED');

    // No downstream task ever reached RUNNING.
    expect(run.tasks['load']!.startTick).toBeNull();
    expect(state.stats.retriedTasks).toBe(2);

    const checker = new TaskSchedulerInvariantChecker();
    expect(checker.check(state)).toBeUndefined();
  });

  it('SCHED-3: invariant checker catches a task that started before upstream success', () => {
    const rng = new DeterministicRNG(6);
    let state = createDefaultTaskSchedulerCluster();
    state = ev(state, { id: 'run', tick: 0, type: 'SCHED_RUN_DAG', payload: { dagId: 'etl-pipeline' } }, rng);
    state = ev(state, { id: 't0', tick: 0, type: 'SCHED_TICK', payload: {} }, rng);

    // Simulate a reducer bug: transform RUNNING while extract still RUNNING.
    const tampered = JSON.parse(JSON.stringify(state)) as TaskSchedulerClusterState;
    tampered.dagRuns['run-etl-pipeline-1']!.tasks['transform']!.status = 'RUNNING';
    tampered.dagRuns['run-etl-pipeline-1']!.tasks['transform']!.attemptCount = 1;

    const checker = new TaskSchedulerInvariantChecker();
    const violation = checker.check(tampered);
    expect(violation).toBeDefined();
    expect(violation?.ruleId).toBe('SCHED-3');
    expect(violation?.description).toContain('before its dependency');
  });

  // ── SCHED-4: mode-aware backoff formulas (NET-3-style exactness) ──

  it('SCHED-4 NONE jitter: backoff is exactly min(max, base * multiplier^attempt)', () => {
    const policy: RetryPolicy = { base: 2, multiplier: 2, maxAttempts: 5, jitter: 'NONE', maxBackoff: 32 };
    const rng = new DeterministicRNG(7);
    expect(computeBackoffDelay(policy, 0, rng)).toBe(2);
    expect(computeBackoffDelay(policy, 1, rng)).toBe(4);
    expect(computeBackoffDelay(policy, 2, rng)).toBe(8);
    expect(computeBackoffDelay(policy, 3, rng)).toBe(16);
    expect(computeBackoffDelay(policy, 4, rng)).toBe(32); // capped
    expect(computeBackoffDelay(policy, 5, rng)).toBe(32); // capped
  });

  it('SCHED-4 EQUAL jitter: delay in [raw/2, raw], FULL jitter: delay in [0, raw]', () => {
    const equal: RetryPolicy = { base: 2, multiplier: 2, maxAttempts: 5, jitter: 'EQUAL', maxBackoff: 32 };
    const full: RetryPolicy = { base: 2, multiplier: 2, maxAttempts: 5, jitter: 'FULL', maxBackoff: 32 };
    const rng = new DeterministicRNG(8);

    for (let attempt = 0; attempt < 5; attempt++) {
      const raw = Math.min(32, 2 * Math.pow(2, attempt));
      for (let trial = 0; trial < 50; trial++) {
        const eq = computeBackoffDelay(equal, attempt, rng);
        expect(eq).toBeGreaterThanOrEqual(Math.floor(raw / 2));
        expect(eq).toBeLessThanOrEqual(raw);
        const fl = computeBackoffDelay(full, attempt, rng);
        expect(fl).toBeGreaterThanOrEqual(0);
        expect(fl).toBeLessThanOrEqual(raw);
      }
    }
  });

  it('SCHED-4: retry timeline grows with the configured schedule and stops at maxAttempts', () => {
    const rng = new DeterministicRNG(9);
    let state = createDefaultTaskSchedulerCluster();

    // Custom DAG with deterministic (NONE) jitter so delays are exact.
    state = ev(
      state,
      {
        id: 'dag2',
        tick: 0,
        type: 'SCHED_DECLARE_DAG',
        payload: {
          dagId: 'retry-timeline',
          tasks: [
            { id: 'single', upstream: [], durationTicks: 1, failOnAttempt: 1 },
          ],
          retry: { base: 2, multiplier: 3, maxAttempts: 3, jitter: 'NONE', maxBackoff: 100 },
        },
      },
      rng,
    );
    state = ev(state, { id: 'run2', tick: 0, type: 'SCHED_RUN_DAG', payload: { dagId: 'retry-timeline' } }, rng);

    let ticks = 0;
    while (state.dagRuns['run-retry-timeline-1']!.state === 'RUNNING' && ticks < 60) {
      ticks++;
      state = ev(state, { id: `tt${ticks}`, tick: ticks, type: 'SCHED_TICK', payload: {} }, rng);
    }

    const task = state.dagRuns['run-retry-timeline-1']!.tasks['single']!;
    expect(task.status).toBe('FAILED_TERMINAL');
    expect(task.attemptCount).toBe(3);
    // Exact NONE-jitter schedule: base * multiplier^failureNumber.
    expect(task.retryDelays).toEqual([2, 6]); // attempts 1 and 2 failed

    const checker = new TaskSchedulerInvariantChecker();
    expect(checker.check(state)).toBeUndefined();
  });

  it('SCHED-4: invariant checker catches out-of-domain and over-budget retries', () => {
    const rng = new DeterministicRNG(10);
    let state = createDefaultTaskSchedulerCluster();
    state = ev(
      state,
      {
        id: 'dag3',
        tick: 0,
        type: 'SCHED_DECLARE_DAG',
        payload: {
          dagId: 'checker-probe',
          tasks: [{ id: 'single', upstream: [], durationTicks: 1, failOnAttempt: 1 }],
          retry: { base: 2, multiplier: 2, maxAttempts: 3, jitter: 'NONE', maxBackoff: 32 },
        },
      },
      rng,
    );
    state = ev(state, { id: 'run3', tick: 0, type: 'SCHED_RUN_DAG', payload: { dagId: 'checker-probe' } }, rng);

    // Case 1: attempt count exceeds maxAttempts.
    const tampered = JSON.parse(JSON.stringify(state)) as TaskSchedulerClusterState;
    tampered.dagRuns['run-checker-probe-1']!.tasks['single']!.attemptCount = 99;
    const v1 = new TaskSchedulerInvariantChecker().check(tampered);
    expect(v1).toBeDefined();
    expect(v1?.ruleId).toBe('SCHED-4');
    expect(v1?.description).toContain('exceeding maxAttempts');

    // Case 2: NONE-jitter delay outside the exact formula.
    const tampered2 = JSON.parse(JSON.stringify(state)) as TaskSchedulerClusterState;
    const t2 = tampered2.dagRuns['run-checker-probe-1']!.tasks['single']!;
    t2.retryDelays = [99]; // raw for failure #0 is 2
    const v2 = new TaskSchedulerInvariantChecker().check(tampered2);
    expect(v2).toBeDefined();
    expect(v2?.ruleId).toBe('SCHED-4');
    expect(v2?.description).toContain('outside the NONE-jitter domain');
  });

  it('cron jobs fire on schedule and dispatch in stable order on simultaneous triggers', () => {
    const rng = new DeterministicRNG(11);
    let state = createDefaultTaskSchedulerCluster();
    // Both jobs fire at tick 15 (every=10 last fired 0 -> fires at 10;
    // every=15 fires at 15). Run to tick 20.
    for (let t = 1; t <= 20; t++) {
      state = ev(state, { id: `ct${t}`, tick: t, type: 'SCHED_TICK', payload: {} }, rng);
    }
    expect(state.dispatchLog['job-report@10']).toBeDefined();
    expect(state.dispatchLog['job-report@20']).toBeDefined();
    expect(state.dispatchLog['job-cleanup@15']).toBeDefined();

    const checker = new TaskSchedulerInvariantChecker();
    expect(checker.check(state)).toBeUndefined();
  });

  it('golden determinism: identical event sequences with identical seeds produce identical state', () => {
    const runChaos = () => {
      const rng = new DeterministicRNG(42);
      let state = createDefaultTaskSchedulerCluster();
      state = ev(state, { id: 'run', tick: 0, type: 'SCHED_RUN_DAG', payload: { dagId: 'etl-pipeline' } }, rng);
      state = ev(
        state,
        { id: 'fail', tick: 0, type: 'SCHED_INJECT_TASK_FAILURE', payload: { runId: 'run-etl-pipeline-1', taskId: 'validate', failOnAttempt: 1 } },
        rng,
      );
      state = ev(
        state,
        { id: 'd', tick: 1, type: 'SCHED_TRIGGER_JOB', payload: { jobId: 'job-report', fireTick: 1 } },
        rng,
      );
      state = ev(state, { id: 'k', tick: 2, type: 'SCHED_KILL_SCHEDULER', payload: { schedulerId: 'scheduler-1' } }, rng);
      for (let t = 2; t <= 30; t++) {
        state = ev(state, { id: `gt${t}`, tick: t, type: 'SCHED_TICK', payload: {} }, rng);
      }
      return JSON.stringify(state);
    };
    expect(runChaos()).toBe(runChaos());
  });
});
