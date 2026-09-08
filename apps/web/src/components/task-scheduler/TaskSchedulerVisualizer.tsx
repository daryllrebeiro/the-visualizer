'use client';

import React from 'react';

import type { TaskSchedulerClusterState, TaskSchedulerSimEvent } from '@the-visualizer/simulation';
import { Badge, ControlButton, DataTable, Panel, StatRow } from '../new-domains/shared';

export interface TaskSchedulerVisualizerProps {
  state: TaskSchedulerClusterState;
  dispatch: (event: TaskSchedulerSimEvent) => void;
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: '#64748b',
  RUNNING: '#38bdf8',
  SUCCESS: '#10b981',
  FAILED_TERMINAL: '#ef4444',
  RETRYING: '#f59e0b',
  SKIPPED_UPSTREAM_FAILED: '#7c3aed',
};

export function TaskSchedulerVisualizer({ state, dispatch }: TaskSchedulerVisualizerProps): React.JSX.Element {
  const ev = (type: TaskSchedulerSimEvent['type'], payload: Record<string, unknown>): void => {
    dispatch({ id: `ts-${Math.random().toString(36).slice(2, 8)}`, tick: state.tick + 1, type, payload } as TaskSchedulerSimEvent);
  };

  const leader = state.currentLeader ? state.schedulers[state.currentLeader] : null;
  const leaseLeft = leader ? Math.max(0, leader.leaseExpireTick - state.tick) : 0;
  const runs = state.dagRunOrder.map((id) => state.dagRuns[id]!);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <Panel
        title="Distributed Task Scheduler — Leader Lease, Exactly-Once, DAG"
        subtitle={`tick ${state.tick} · lease ${state.leaseDurationTicks}t · dedup window = idempotency key`}
        accent="#10b981"
        right={
          <div style={{ display: 'flex', gap: '6px' }}>
            <ControlButton label="Tick" tone="success" onClick={() => ev('SCHED_TICK', {})} />
            <ControlButton label="Run ETL DAG" onClick={() => ev('SCHED_RUN_DAG', { dagId: 'etl-pipeline' })} />
          </div>
        }
      >
        <StatRow
          items={[
            { label: 'Leader', value: state.currentLeader ?? '(none)', color: '#10b981' },
            { label: 'Lease expires in', value: `${leaseLeft}t` },
            { label: 'Dispatches', value: String(state.stats.dispatches) },
            { label: 'Dedup rejections', value: String(state.stats.dedupRejections), color: state.stats.dedupRejections > 0 ? '#f59e0b' : undefined },
            { label: 'Lease rejections', value: String(state.stats.leaseRejections), color: state.stats.leaseRejections > 0 ? '#ef4444' : undefined },
            { label: 'Failovers', value: String(state.stats.leaderFailovers) },
          ]}
        />
      </Panel>

      <Panel title="Scheduler fleet — SCHED-1 single active lease" accent="#3b82f6">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
          {state.schedulerOrder.map((id) => {
            const node = state.schedulers[id]!;
            return (
              <div
                key={id}
                style={{
                  backgroundColor: '#020617',
                  border: `1px solid ${node.isLeader && node.online ? '#10b981' : node.online ? '#334155' : '#ef4444'}`,
                  borderRadius: '8px',
                  padding: '10px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <strong style={{ color: '#f8fafc', fontSize: '0.85rem' }}>{id}</strong>
                  {node.isLeader && node.online ? (
                    <Badge text={`LEADER (${Math.max(0, node.leaseExpireTick - state.tick)}t)`} color="#10b981" />
                  ) : (
                    <Badge text={node.online ? 'standby' : 'DOWN'} color={node.online ? '#64748b' : '#ef4444'} />
                  )}
                </div>
                <div style={{ display: 'flex', gap: '4px' }}>
                  {node.online ? (
                    <ControlButton label="💥 Kill" tone="danger" onClick={() => ev('SCHED_KILL_SCHEDULER', { schedulerId: id })} />
                  ) : (
                    <ControlButton label="💚 Revive" tone="success" onClick={() => ev('SCHED_REVIVE_SCHEDULER', { schedulerId: id })} />
                  )}
                  <ControlButton
                    label="Attempt acquire"
                    disabled={node.isLeader}
                    onClick={() => ev('SCHED_ATTEMPT_ACQUIRE', { schedulerId: id })}
                  />
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: '10px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <ControlButton label="Trigger job-report now" onClick={() => ev('SCHED_TRIGGER_JOB', { jobId: 'job-report' })} />
          <ControlButton
            label="Split-brain: standby dispatches (SCHED-1)"
            tone="danger"
            onClick={() => {
              const standby = state.schedulerOrder.find((id) => id !== state.currentLeader);
              if (standby) {
                ev('SCHED_ATTEMPT_DISPATCH', { schedulerId: standby, jobId: 'job-report', fireTick: state.tick });
              }
            }}
          />
          <ControlButton
            label="Replay last dispatch (SCHED-2 dedup)"
            tone="warn"
            onClick={() => {
              const lastKey = state.dispatchOrder.at(-1);
              if (lastKey) {
                const [jobId, fireTick] = lastKey.split('@');
                ev('SCHED_ATTEMPT_DISPATCH', { schedulerId: state.currentLeader ?? 'scheduler-1', jobId, fireTick: Number(fireTick) });
              }
            }}
          />
        </div>
      </Panel>

      {runs.length === 0 && (
        <Panel title="DAG execution graph" accent="#8b5cf6">
          <div style={{ color: '#475569', fontSize: '0.8rem' }}>
            No DAG runs yet — press &quot;Run ETL DAG&quot;. The default pipeline: extract → (transform ∥ validate) → load.
          </div>
        </Panel>
      )}

      {runs.map((run) => (
        <Panel
          key={run.runId}
          title={`DAG run ${run.runId}`}
          subtitle={`state ${run.state} · started t${run.startTick}`}
          accent={run.state === 'SUCCEEDED' ? '#10b981' : run.state === 'FAILED' ? '#ef4444' : '#38bdf8'}
          right={
            <div style={{ display: 'flex', gap: '6px' }}>
              <ControlButton
                label="💥 Fail 'transform'"
                tone="danger"
                onClick={() => ev('SCHED_INJECT_TASK_FAILURE', { runId: run.runId, taskId: 'transform', failOnAttempt: 1 })}
              />
              <ControlButton
                label="💥 Fail 'extract'"
                tone="danger"
                onClick={() => ev('SCHED_INJECT_TASK_FAILURE', { runId: run.runId, taskId: 'extract', failOnAttempt: 1 })}
              />
            </div>
          }
        >
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
            {run.tasks['extract'] && (
              <DagTaskNode id="extract" status={run.tasks['extract']!.status} attempts={run.tasks['extract']!.attemptCount} retryDelays={run.tasks['extract']!.retryDelays} />
            )}
            <span style={{ color: '#475569' }}>→</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {run.tasks['transform'] && (
                <DagTaskNode id="transform" status={run.tasks['transform']!.status} attempts={run.tasks['transform']!.attemptCount} retryDelays={run.tasks['transform']!.retryDelays} />
              )}
              {run.tasks['validate'] && (
                <DagTaskNode id="validate" status={run.tasks['validate']!.status} attempts={run.tasks['validate']!.attemptCount} retryDelays={run.tasks['validate']!.retryDelays} />
              )}
            </div>
            <span style={{ color: '#475569' }}>→</span>
            {run.tasks['load'] && (
              <DagTaskNode id="load" status={run.tasks['load']!.status} attempts={run.tasks['load']!.attemptCount} retryDelays={run.tasks['load']!.retryDelays} />
            )}
          </div>
        </Panel>
      ))}

      <Panel title="Dispatch log (exactly-once via idempotency keys)" accent="#f59e0b">
        <DataTable
          headers={['idempotency key', 'dispatched at', 'by']}
          rows={[...state.dispatchOrder]
            .reverse()
            .slice(0, 12)
            .map((key) => {
              const rec = state.dispatchLog[key]!;
              return [
                <code key="k" style={{ color: '#f59e0b' }}>{key}</code>,
                `t${rec.dispatchedTick}`,
                rec.dispatchedBy,
              ];
            })}
          maxHeight="180px"
        />
      </Panel>
    </div>
  );
}

function DagTaskNode({
  id,
  status,
  attempts,
  retryDelays,
}: {
  id: string;
  status: string;
  attempts: number;
  retryDelays: ReadonlyArray<number>;
}): React.JSX.Element {
  return (
    <div
      style={{
        backgroundColor: '#020617',
        border: `1px solid ${STATUS_COLORS[status] ?? '#334155'}`,
        borderRadius: '8px',
        padding: '8px 12px',
        minWidth: '140px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center' }}>
        <strong style={{ color: '#f8fafc', fontSize: '0.8rem' }}>{id}</strong>
        <Badge text={status} color={STATUS_COLORS[status] ?? '#64748b'} />
      </div>
      <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '4px' }}>
        attempt {attempts}
        {retryDelays.length > 0 && ` · backoff: ${retryDelays.map((d) => `${d}t`).join(', ')}`}
      </div>
    </div>
  );
}
