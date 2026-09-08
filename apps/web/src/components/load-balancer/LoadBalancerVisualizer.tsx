'use client';

import React from 'react';

import type { LBClusterState, LBSimEvent, LBRoutingPolicy } from '@the-visualizer/simulation';
import { Badge, ControlButton, DataTable, LogView, Panel, StatRow } from '../new-domains/shared';

export interface LoadBalancerVisualizerProps {
  state: LBClusterState;
  dispatch: (event: LBSimEvent) => void;
}

const HEALTH_COLORS: Record<string, string> = {
  HEALTHY: '#10b981',
  UNHEALTHY: '#ef4444',
  DRAINING: '#f59e0b',
};

const POLICIES: ReadonlyArray<{ id: LBRoutingPolicy; label: string }> = [
  { id: 'ROUND_ROBIN', label: 'Round Robin' },
  { id: 'WEIGHTED_RR', label: 'Smooth WRR (nginx)' },
  { id: 'LEAST_CONNECTIONS', label: 'Least Connections' },
  { id: 'LEAST_RESPONSE_TIME', label: 'Least Response Time' },
  { id: 'CONSISTENT_HASH', label: 'Consistent Hash (sticky)' },
];

export function LoadBalancerVisualizer({ state, dispatch }: LoadBalancerVisualizerProps): React.JSX.Element {
  const ev = (type: LBSimEvent['type'], payload: Record<string, unknown>): void => {
    dispatch({ id: `lb-${Math.random().toString(36).slice(2, 8)}`, tick: state.tick + 1, type, payload } as LBSimEvent);
  };

  const backends = state.backendOrder.map((id) => state.backends[id]!);
  const totalDispatched = backends.reduce((acc, b) => acc + b.dispatchCount, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <Panel
        title="Load Balancer — L4/L7 Routing"
        subtitle={`policy ${state.routingPolicy} · tick ${state.tick} · health checks every ${state.healthChecker.interval}t (fail ×${state.healthChecker.failureThreshold})`}
        accent="#3b82f6"
        right={
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <ControlButton label="Request" onClick={() => ev('LB_REQUEST', {})} />
            <ControlButton label="100 reqs" onClick={() => ev('LB_LOAD_TEST', { count: 100 })} />
            <ControlButton label="Tick" onClick={() => ev('LB_TICK', {})} />
          </div>
        }
      >
        <StatRow
          items={[
            { label: 'Dispatched (window)', value: String(totalDispatched) },
            { label: 'Open connections', value: String(Object.keys(state.connections).length) },
            { label: 'Dropped', value: String(state.stats.totalDropped), color: state.stats.totalDropped > 0 ? '#ef4444' : undefined },
            { label: 'Failovers', value: String(state.stats.failovers) },
            { label: 'Drain completions', value: String(state.stats.drainCompletions) },
          ]}
        />
      </Panel>

      <Panel title="Routing policy (switch live on identical traffic)" accent="#8b5cf6">
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {POLICIES.map((p) => (
            <ControlButton
              key={p.id}
              label={p.label}
              tone={state.routingPolicy === p.id ? 'success' : 'default'}
              onClick={() => ev('LB_SET_POLICY', { policy: p.id })}
            />
          ))}
        </div>
      </Panel>

      <Panel title="Backend pool — health, weights, live distribution" accent="#10b981">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '10px' }}>
          {backends.map((b) => {
            const share = totalDispatched > 0 ? (b.dispatchCount / totalDispatched) * 100 : 0;
            return (
              <div
                key={b.id}
                style={{
                  backgroundColor: '#020617',
                  border: `1px solid ${b.health === 'HEALTHY' ? '#334155' : HEALTH_COLORS[b.health]}`,
                  borderRadius: '8px',
                  padding: '10px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ color: '#f8fafc', fontSize: '0.85rem' }}>{b.id}</strong>
                  <Badge text={b.health} color={HEALTH_COLORS[b.health] as string} />
                </div>
                <StatRow
                  items={[
                    { label: 'weight', value: String(b.weight) },
                    { label: 'in-flight', value: String(b.inFlight) },
                    { label: 'EWMA', value: `${b.responseTimeEwma.toFixed(1)}t` },
                    { label: 'served', value: `${b.dispatchCount} (${share.toFixed(0)}%)` },
                  ]}
                />
                <div style={{ height: '6px', backgroundColor: '#1e293b', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ width: `${share}%`, height: '100%', backgroundColor: '#38bdf8' }} />
                </div>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                  {b.health === 'HEALTHY' && (
                    <>
                      <ControlButton label="💥 Kill" tone="danger" onClick={() => ev('LB_KILL_BACKEND', { backendId: b.id })} />
                      <ControlButton label="🚰 Drain" tone="warn" onClick={() => ev('LB_START_DRAIN', { backendId: b.id })} />
                    </>
                  )}
                  {b.health === 'UNHEALTHY' && (
                    <ControlButton label="💚 Revive" tone="success" onClick={() => ev('LB_REVIVE_BACKEND', { backendId: b.id })} />
                  )}
                  <ControlButton label="w+1" onClick={() => ev('LB_SET_WEIGHT', { backendId: b.id, weight: b.weight + 1 })} />
                  <ControlButton label="w-1" onClick={() => ev('LB_SET_WEIGHT', { backendId: b.id, weight: Math.max(1, b.weight - 1) })} />
                </div>
                {b.health === 'DRAINING' && (
                  <span style={{ fontSize: '0.7rem', color: '#f59e0b' }}>
                    draining · {b.inFlight} in-flight to complete (timeout {state.drainTimeoutTicks}t)
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: '10px' }}>
          <ControlButton
            label="🔁 Rolling deploy (drain + replace all backends, zero downtime)"
            tone="warn"
            disabled={state.rollingDeploy.active}
            onClick={() => ev('LB_ROLLING_DEPLOY', {})}
          />
          {state.rollingDeploy.active && (
            <span style={{ fontSize: '0.75rem', color: '#f59e0b', marginLeft: '8px' }}>
              deploy in progress: replaced {state.rollingDeploy.replacedCount}/{state.backendOrder.length}
            </span>
          )}
        </div>
      </Panel>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <Panel title="Routing decisions (algorithm reasoning)" accent="#38bdf8">
          <LogView
            lines={[...state.routingLog]
              .reverse()
              .slice(0, 30)
              .map((r) => `[t${r.tick}] ${r.sessionKey} → ${r.backendId ?? 'DROPPED'} · ${r.reasoning}`)}
          />
        </Panel>
        <Panel title="Completed connections" accent="#64748b">
          <DataTable
            headers={['conn', 'backend', 'session', 'start→end', 'dur']}
            rows={[...state.connectionLog]
              .reverse()
              .slice(0, 12)
              .map((c) => [c.id, c.backendId, c.sessionKey, `${c.startTick}→${c.endTick}`, `${c.durationTicks}t`])}
            maxHeight="180px"
          />
        </Panel>
      </div>
    </div>
  );
}
