'use client';

import React from 'react';

import type { LlmEvalClusterState, LlmEvalSimEvent } from '@the-visualizer/simulation';
import { Badge, ControlButton, DataTable, Panel, StatRow } from '../new-domains/shared';

export interface LlmEvalVisualizerProps {
  state: LlmEvalClusterState;
  dispatch: (event: LlmEvalSimEvent) => void;
}

export function LlmEvalVisualizer({ state, dispatch }: LlmEvalVisualizerProps): React.JSX.Element {
  const ev = (type: LlmEvalSimEvent['type'], payload: Record<string, unknown>): void => {
    dispatch({ id: `le-${Math.random().toString(36).slice(2, 8)}`, tick: state.tick + 1, type, payload } as LlmEvalSimEvent);
  };

  const latestRun = state.evalRunOrder.length > 0 ? state.evalRuns[state.evalRunOrder.at(-1) as string] : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <Panel
        title="LLM Evaluation & Guardrails — Offline Gate"
        subtitle={`${state.evalSuite.length} suite cases · ${state.redTeamAttempts.length} red-team attempts · policy v${state.latestPolicyVersion} (${state.policies[state.latestPolicyVersion]?.severityThreshold}+)} · baseline ${state.baselineModelVersion}`}
        accent="#ef4444"
        right={
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {state.modelOrder.map((m) => (
              <ControlButton key={m} label={`Run ${m}`} tone="success" onClick={() => ev('EVAL_RUN', { modelVersion: m })} />
            ))}
          </div>
        }
      >
        <StatRow
          items={[
            { label: 'Runs', value: String(state.stats.runsExecuted) },
            { label: 'Regressions (EVAL-2)', value: String(state.stats.regressionsDetected), color: state.stats.regressionsDetected > 0 ? '#ef4444' : undefined },
            { label: 'Rescores (EVAL-3)', value: String(state.stats.rescoresExecuted) },
            { label: 'Gates blocked (EVAL-4)', value: String(state.stats.gatesBlocked), color: state.stats.gatesBlocked > 0 ? '#ef4444' : undefined },
          ]}
        />
      </Panel>

      {latestRun && (
        <Panel
          title={`Latest run: ${latestRun.id}`}
          subtitle={`model ${latestRun.modelVersion} · policy v${latestRun.policyVersion} · ${latestRun.completed ? 'COMPLETE' : 'PARTIAL (EVAL-1 forbids reporting as complete)'}`}
          accent={latestRun.completed ? '#10b981' : '#f59e0b'}
        >
          <StatRow
            items={[
              {
                label: 'Cases passed',
                value: `${Object.values(latestRun.caseResults).filter((r) => r.passed).length}/${Object.keys(latestRun.caseResults).length}`,
              },
              {
                label: 'Critical failures',
                value: String(latestRun.criticalFailures.length),
                color: latestRun.criticalFailures.length > 0 ? '#ef4444' : '#10b981',
              },
              {
                label: 'Red-team elicited',
                value: `${Object.values(latestRun.redTeamResults).filter((r) => r.elicited).length}/${state.redTeamAttempts.length}`,
              },
            ]}
          />
          {latestRun.regressions.length > 0 && (
            <div style={{ marginTop: '8px', color: '#ef4444', fontSize: '0.75rem' }}>
              ⚠ REGRESSIONS vs baseline run {latestRun.baselineRunId}:
              <ul style={{ margin: '4px 0 0 0', paddingLeft: '18px' }}>
                {latestRun.regressions.map((r) => (
                  <li key={r.attemptId}>{r.note}</li>
                ))}
              </ul>
            </div>
          )}
          <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
            <ControlButton
              label="Rescore under stricter policy (v_next: HIGH+) (EVAL-3)"
              tone="warn"
              onClick={() => {
                const nextVersion = state.latestPolicyVersion + 1;
                ev('EVAL_DECLARE_POLICY', { severityThreshold: 'HIGH' });
                ev('EVAL_RESCORE', { runId: latestRun.id, policyVersion: nextVersion });
              }}
            />
            <ControlButton label="🚦 Produce deployment gate (EVAL-4)" tone="success" onClick={() => ev('EVAL_GATE', { modelVersion: latestRun.modelVersion })} />
          </div>
        </Panel>
      )}

      {latestRun && (
        <Panel title="Eval suite results grid (case × verdict, by risk area)" accent="#38bdf8">
          <DataTable
            headers={['case', 'risk area', 'severity', 'violation', 'passed']}
            rows={state.evalSuite.map((c) => {
              const result = latestRun.caseResults[c.id];
              return [
                <code key="c" style={{ color: '#94a3b8' }}>{c.id}</code>,
                c.riskArea,
                <Badge key="s" text={c.severity} color={c.severity === 'CRITICAL' ? '#ef4444' : c.severity === 'HIGH' ? '#f59e0b' : '#64748b'} />,
                result ? (result.violation ? '⚠' : '✓') : '—',
                result ? (
                  <Badge key="p" text={result.passed ? 'PASS' : 'FAIL'} color={result.passed ? '#10b981' : '#ef4444'} />
                ) : (
                  <Badge key="p" text="SKIPPED" color="#475569" />
                ),
              ];
            })}
            maxHeight="240px"
          />
        </Panel>
      )}

      {latestRun && (
        <Panel title="Red-team lane across model versions (regression = newly-red cell)" accent="#ef4444">
          <DataTable
            headers={['attempt', 'prompt', ...state.evalRunOrder.map((id) => state.evalRuns[id]!.modelVersion)]}
            rows={state.redTeamAttempts.map((attempt) => [
              <code key="a" style={{ color: '#94a3b8' }}>{attempt.id}</code>,
              <span key="p" style={{ fontSize: '0.7rem' }}>{attempt.adversarialPrompt.slice(0, 48)}…</span>,
              ...state.evalRunOrder.map((id) => {
                const result = state.evalRuns[id]!.redTeamResults[attempt.id];
                if (!result) return '—';
                return (
                  <Badge
                    key={id}
                    text={result.elicited ? 'ELICITED' : 'blocked'}
                    color={result.elicited ? '#ef4444' : '#10b981'}
                  />
                );
              }),
            ])}
            maxHeight="200px"
          />
          <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
            <ControlButton
              label="Declare model-v2.0-rc (red-team regression scripted on rt-1)"
              tone="warn"
              onClick={() => {
                ev('EVAL_DECLARE_MODEL', {
                  modelVersion: 'model-v2.0-rc',
                  violationRateByRisk: { SAFETY: 0.05, PRIVACY: 0.05 },
                  redTeamOverrides: { 'rt-1': true },
                });
              }}
            />
            <ControlButton
              label="Declare unsafe model (critical case violation)"
              tone="danger"
              onClick={() => {
                ev('EVAL_DECLARE_MODEL', {
                  modelVersion: 'model-unsafe',
                  caseOverrides: { 'case-safety-1': true },
                });
              }}
            />
          </div>
        </Panel>
      )}

      <Panel title="Deployment gate outputs (consumed by /model-rollout)" accent="#ec4899">
        {Object.keys(state.gateOutputs).length === 0 ? (
          <div style={{ color: '#475569', fontSize: '0.8rem' }}>No gate outputs yet — run an eval then press the gate button.</div>
        ) : (
          <DataTable
            headers={['model', 'source run', 'policy', 'critical passed', 'blocked']}
            rows={Object.values(state.gateOutputs).map((g) => [
              g.modelVersion,
              g.sourceRunId,
              `v${g.policyVersion}`,
              g.criticalPassed ? '✓' : '✗',
              <Badge key="b" text={g.blocked ? 'BLOCKED' : 'CLEARED'} color={g.blocked ? '#ef4444' : '#10b981'} />,
            ])}
          />
        )}
      </Panel>
    </div>
  );
}
