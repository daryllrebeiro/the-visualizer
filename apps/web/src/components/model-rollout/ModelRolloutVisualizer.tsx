'use client';

import React from 'react';

import type { ModelRolloutClusterState, ModelRolloutSimEvent } from '@the-visualizer/simulation';
import { Badge, ControlButton, DataTable, Panel, StatRow } from '../new-domains/shared';

export interface ModelRolloutVisualizerProps {
  state: ModelRolloutClusterState;
  dispatch: (event: ModelRolloutSimEvent) => void;
}

export function ModelRolloutVisualizer({ state, dispatch }: ModelRolloutVisualizerProps): React.JSX.Element {
  const ev = (type: ModelRolloutSimEvent['type'], payload: Record<string, unknown>): void => {
    dispatch({ id: `mr-${Math.random().toString(36).slice(2, 8)}`, tick: state.tick + 1, type, payload } as ModelRolloutSimEvent);
  };

  const baselineMetrics = state.metrics[state.baselineVersion]!;
  const canaryMetrics = state.canaryVersion ? state.metrics[state.canaryVersion] : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <Panel
        title="Model Deployment & Canary Rollout"
        subtitle={`tick ${state.tick} · threshold ${(state.rolloutPolicy.errorRateThreshold * 100).toFixed(0)}% · window ${state.rolloutPolicy.evaluationWindowTicks}t · minN ${state.rolloutPolicy.minSamplePerArm}/arm`}
        accent="#ec4899"
        right={<ControlButton label="Tick (eval window)" tone="success" onClick={() => ev('ROLL_TICK', {})} />}
      >
        <StatRow
          items={[
            { label: 'Stable', value: state.baselineVersion, color: '#10b981' },
            { label: 'Canary', value: state.canaryVersion ?? '(none)', color: state.canaryVersion ? '#f59e0b' : undefined },
            { label: 'Split', value: `${state.trafficSplit.baselinePercent}:${state.trafficSplit.canaryPercent}` },
            { label: 'Bad ticks', value: `${state.consecutiveBadTicks}/${state.rolloutPolicy.evaluationWindowTicks}`, color: state.consecutiveBadTicks > 0 ? '#ef4444' : undefined },
            { label: 'Rollbacks', value: String(state.stats.rollbacks), color: state.stats.rollbacks > 0 ? '#ef4444' : undefined },
          ]}
        />
      </Panel>

      <Panel title="Traffic split — live lanes vs shadow lane" accent="#38bdf8">
        <div style={{ height: '20px', display: 'flex', borderRadius: '6px', overflow: 'hidden', marginBottom: '8px' }}>
          <div
            style={{
              width: `${state.trafficSplit.baselinePercent}%`,
              backgroundColor: '#10b981',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.65rem',
              color: '#020617',
              fontWeight: 700,
            }}
          >
            {state.trafficSplit.baselinePercent > 12 ? `${state.baselineVersion} ${state.trafficSplit.baselinePercent}%` : ''}
          </div>
          <div
            style={{
              width: `${state.trafficSplit.canaryPercent}%`,
              backgroundColor: '#f59e0b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.65rem',
              color: '#020617',
              fontWeight: 700,
            }}
          >
            {state.trafficSplit.canaryPercent > 12 ? `${state.canaryVersion} ${state.trafficSplit.canaryPercent}%` : ''}
          </div>
        </div>
        {state.shadowEnabled && (
          <div style={{ fontSize: '0.7rem', color: '#8b5cf6', marginBottom: '8px' }}>
            ┄┄ shadow lane: {state.shadowVersion} mirrors 100% of traffic (responses discarded — ROLL-1)
          </div>
        )}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {[0, 5, 10, 25, 50].map((p) => (
            <ControlButton
              key={p}
              label={`Canary ${p}%`}
              tone={state.trafficSplit.canaryPercent === p ? 'success' : 'default'}
              disabled={!state.canaryVersion}
              onClick={() => state.canaryVersion && ev('ROLL_SET_CANARY', { version: state.canaryVersion, percent: p })}
            />
          ))}
          <ControlButton label="Send 500 requests" tone="success" onClick={() => ev('ROLL_SEND_TRAFFIC', { count: 500 })} />
          <ControlButton
            label={state.shadowEnabled ? 'Disable shadow' : 'Mirror traffic to shadow (model-v2)'}
            tone={state.shadowEnabled ? 'warn' : 'default'}
            onClick={() => ev('ROLL_SET_SHADOW', { version: state.shadowVersion ?? 'model-v2', enabled: !state.shadowEnabled })}
          />
        </div>
      </Panel>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <Panel title="Live metrics per version" accent="#10b981">
          <DataTable
            headers={['version', 'stage', 'reqs', 'errors', 'err%', 'conversions', 'cvr%']}
            rows={state.modelOrder.map((id) => {
              const m = state.metrics[id]!;
              const errPct = m.requests > 0 ? (m.errors / m.requests) * 100 : 0;
              const cvrPct = m.requests > 0 ? (m.conversions / m.requests) * 100 : 0;
              const isBaseline = id === state.baselineVersion;
              const isCanary = id === state.canaryVersion;
              return [
                <strong key="v" style={{ color: isBaseline ? '#10b981' : isCanary ? '#f59e0b' : '#94a3b8' }}>{id}</strong>,
                <Badge key="s" text={state.registry[id]!.stage} color={isBaseline ? '#10b981' : isCanary ? '#f59e0b' : '#64748b'} />,
                String(m.requests),
                String(m.errors),
                <span key="e" style={{ color: errPct > state.rolloutPolicy.errorRateThreshold * 100 ? '#ef4444' : '#94a3b8' }}>
                  {errPct.toFixed(1)}
                </span>,
                String(m.conversions),
                cvrPct.toFixed(1),
              ];
            })}
          />
          {state.shadowEnabled && (
            <div style={{ marginTop: '8px', fontSize: '0.7rem', color: '#8b5cf6' }}>
              shadow lane: {state.shadowMetrics.requests} reqs, {state.shadowMetrics.errors} errors — zero client impact (ROLL-1)
            </div>
          )}
          <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
            <ControlButton
              label="💥 Inject canary errors (15%)"
              tone="danger"
              disabled={!state.canaryVersion}
              onClick={() => state.canaryVersion && ev('ROLL_SET_RATES', { version: state.canaryVersion, errorRate: 0.15 })}
            />
            <ControlButton
              label="📈 Better canary conversions (70%)"
              disabled={!state.canaryVersion}
              onClick={() => state.canaryVersion && ev('ROLL_SET_RATES', { version: state.canaryVersion, conversionRate: 0.7 })}
            />
          </div>
        </Panel>

        <Panel title="Promotion — significance gate + eval gate" accent="#ec4899">
          {state.lastPromotionAttempt === null ? (
            <div style={{ color: '#475569', fontSize: '0.8rem' }}>
              No promotion attempted yet.
              <div style={{ marginTop: '8px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                <ControlButton label="🚀 Attempt promotion" tone="success" disabled={!state.canaryVersion} onClick={() => ev('ROLL_PROMOTE', {})} />
              </div>
            </div>
          ) : (
            <>
              <StatRow
                items={[
                  { label: 'Allowed', value: state.lastPromotionAttempt.allowed ? 'YES' : 'NO', color: state.lastPromotionAttempt.allowed ? '#10b981' : '#ef4444' },
                  {
                    label: 'z-score',
                    value: state.lastPromotionAttempt.zScore === null ? '—' : state.lastPromotionAttempt.zScore.toFixed(3),
                    color: (state.lastPromotionAttempt.zScore ?? 0) > 1.96 ? '#10b981' : '#f59e0b',
                  },
                  { label: 'n (base/canary)', value: `${state.lastPromotionAttempt.sampleSizes.baseline}/${state.lastPromotionAttempt.sampleSizes.canary}` },
                ]}
              />
              <ul style={{ margin: '8px 0 0 0', paddingLeft: '18px', fontSize: '0.75rem', color: '#94a3b8' }}>
                {state.lastPromotionAttempt.reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
                {state.lastPromotionAttempt.reasons.length === 0 && <li>all gates passed — canary promoted to STABLE</li>}
              </ul>
              <div style={{ marginTop: '8px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                <ControlButton label="🚀 Attempt promotion" tone="success" disabled={!state.canaryVersion} onClick={() => ev('ROLL_PROMOTE', {})} />
                <ControlButton
                  label="🧪 Set blocked eval gate (ROLL-5)"
                  tone="danger"
                  onClick={() =>
                    ev('ROLL_SET_EVAL_GATE', {
                      gate: { sourceRunId: 'run-manual', policyVersion: 1, criticalPassed: false, blocked: true },
                    })
                  }
                />
                <ControlButton label="🧹 Clear gate" onClick={() => ev('ROLL_CLEAR_EVAL_GATE', {})} />
              </div>
              {state.evalGate && (
                <div style={{ marginTop: '6px', fontSize: '0.7rem', color: state.evalGate.blocked ? '#ef4444' : '#10b981' }}>
                  eval gate: run {state.evalGate.sourceRunId} (policy v{state.evalGate.policyVersion}) →{' '}
                  {state.evalGate.blocked ? 'BLOCKED' : 'clear'}
                </div>
              )}
            </>
          )}
        </Panel>
      </div>

      {state.lastRollbackEvent && (
        <Panel title="Rollback event (ROLL-3 — automatic)" accent="#ef4444">
          <StatRow
            items={[
              { label: 'At tick', value: String(state.lastRollbackEvent.tick) },
              { label: 'Version', value: state.lastRollbackEvent.version, color: '#ef4444' },
              { label: 'Trigger', value: state.lastRollbackEvent.triggerMetric, color: '#ef4444' },
            ]}
          />
        </Panel>
      )}

      <Panel title="Canary setup" accent="#64748b">
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {state.modelOrder
            .filter((id) => id !== state.baselineVersion && state.registry[id]!.stage !== 'ARCHIVED')
            .map((id) => (
              <ControlButton
                key={id}
                label={`Set ${id} as canary @10%`}
                tone={state.canaryVersion === id ? 'success' : 'default'}
                onClick={() => ev('ROLL_SET_CANARY', { version: id, percent: 10 })}
              />
            ))}
          <ControlButton
            label="Register model-v4"
            disabled={Object.keys(state.registry).length >= 6}
            onClick={() => ev('ROLL_REGISTER_MODEL', { id: 'model-v4', errorRate: 0.02, conversionRate: 0.65 })}
          />
        </div>
        <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '6px' }}>
          Current live metrics — baseline: {baselineMetrics.requests} reqs; canary:{' '}
          {canaryMetrics ? `${canaryMetrics.requests} reqs` : 'none'}
        </div>
      </Panel>
    </div>
  );
}
