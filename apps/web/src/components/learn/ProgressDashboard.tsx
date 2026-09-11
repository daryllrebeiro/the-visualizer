'use client';

import React from 'react';

import type { UserProgress } from '@the-visualizer/contracts';

export interface DomainTotals {
  domainId: string;
  name: string;
  color: string;
  scenarios: number;
  quizzes: number;
}

function IntensityBar({ fraction, color }: { fraction: number; color: string }): React.JSX.Element {
  return (
    <div
      role="img"
      aria-label={`${String(Math.round(fraction * 100))}% complete`}
      style={{ height: '8px', borderRadius: '4px', backgroundColor: '#1e293b', overflow: 'hidden', minWidth: '80px' }}
    >
      <div style={{ height: '100%', width: `${String(Math.round(fraction * 100))}%`, backgroundColor: color }} />
    </div>
  );
}

export function ProgressDashboard({
  progress,
  totals,
}: {
  progress: UserProgress;
  totals: DomainTotals[];
}): React.JSX.Element {
  const quizCorrectTotal = Object.values(progress.domains).reduce(
    (sum, d) => sum + Object.values(d.quizAnswered).filter((q) => q.correct).length,
    0,
  );
  const scenarioTotal = Object.values(progress.domains).reduce((sum, d) => sum + d.scenariosCompleted.length, 0);
  const invariantTotal = Object.values(progress.domains).reduce((sum, d) => sum + d.invariantsTriggered.length, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        {[
          { label: 'Scenarios completed', value: scenarioTotal },
          { label: 'Quiz questions correct', value: quizCorrectTotal },
          { label: 'Invariants triggered', value: invariantTotal },
        ].map((s) => (
          <div
            key={s.label}
            style={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '10px', padding: '12px 18px', minWidth: '160px' }}
          >
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#f8fafc' }}>{s.value}</div>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.8rem' }}>
          <thead>
            <tr style={{ color: '#94a3b8', textAlign: 'left' }}>
              <th style={{ padding: '8px', borderBottom: '1px solid #334155' }}>Domain</th>
              <th style={{ padding: '8px', borderBottom: '1px solid #334155' }}>Scenarios</th>
              <th style={{ padding: '8px', borderBottom: '1px solid #334155' }}>Quizzes</th>
              <th style={{ padding: '8px', borderBottom: '1px solid #334155' }}>Invariants hit</th>
              <th style={{ padding: '8px', borderBottom: '1px solid #334155' }}>Last visited</th>
            </tr>
          </thead>
          <tbody>
            {totals.map((t) => {
              const d = progress.domains[t.domainId];
              const scen = d ? d.scenariosCompleted.length : 0;
              const correct = d ? Object.values(d.quizAnswered).filter((q) => q.correct).length : 0;
              const inv = d ? d.invariantsTriggered.length : 0;
              return (
                <tr key={t.domainId} style={{ borderBottom: '1px solid #1e293b' }}>
                  <td style={{ padding: '8px', color: '#f8fafc', fontWeight: 600 }}>
                    <span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', backgroundColor: t.color, marginRight: '8px' }} />
                    <a href={`/${t.domainId}`} style={{ color: '#f8fafc' }}>{t.name}</a>
                  </td>
                  <td style={{ padding: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <IntensityBar fraction={t.scenarios === 0 ? 0 : Math.min(1, scen / t.scenarios)} color={t.color} />
                      <span style={{ color: '#94a3b8' }}>{scen}/{t.scenarios}</span>
                    </div>
                  </td>
                  <td style={{ padding: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <IntensityBar fraction={t.quizzes === 0 ? 0 : Math.min(1, correct / t.quizzes)} color={t.color} />
                      <span style={{ color: '#94a3b8' }}>{correct}/{t.quizzes}</span>
                    </div>
                  </td>
                  <td style={{ padding: '8px', color: '#e2e8f0' }}>{inv}</td>
                  <td style={{ padding: '8px', color: '#94a3b8' }}>
                    {d ? new Date(d.lastVisitedAt).toLocaleDateString() : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
