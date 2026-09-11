'use client';

import React from 'react';

import { DomainRegistry } from '@the-visualizer/simulation';

import { DOMAIN_OPTIONS } from '../domain-options';
import { LearnNav } from '../../components/learn/LearnNav';
import { useLearnStore } from '../../components/learn/learn-store';
import { quizForDomain } from '../../components/learn/quiz-banks';
import { challengeForDomain } from '../../components/learn/challenge-bank';

interface DomainAnalytics {
  domainId: string;
  name: string;
  color: string;
  category: string;
  fidelity: string;
  scenarios: { done: number; total: number };
  quizzes: { correct: number; total: number };
  invariantsTriggered: number;
  challenges: { solved: number; total: number };
  visited: boolean;
  timeSpentMs: number;
}

export default function AnalyticsPage(): React.JSX.Element {
  const progress = useLearnStore((s) => s.progress);
  const attempts = useLearnStore((s) => s.attempts);
  const interviewsCompleted = useLearnStore((s) => s.interviewsCompleted);

  const rows = React.useMemo<DomainAnalytics[]>(() => {
    return DOMAIN_OPTIONS.map((opt) => {
      const meta = DomainRegistry.list().find((m) => m.id === opt.id);
      const d = progress.domains[opt.id];
      const bank = quizForDomain(opt.id);
      const challengeList = challengeForDomain(opt.id);
      const solved = challengeList.filter((c) => attempts[c.id]?.solved).length;
      return {
        domainId: opt.id,
        name: opt.name,
        color: opt.color,
        category: opt.category,
        fidelity: meta?.fidelityTag ?? 'UNKNOWN',
        scenarios: {
          done: d?.scenariosCompleted.length ?? 0,
          total: meta?.id ? (DomainRegistry.get(opt.id)?.scenarioLibrary.length ?? 0) : 0,
        },
        quizzes: {
          correct: d ? Object.values(d.quizAnswered).filter((q) => q.correct).length : 0,
          total: bank.length,
        },
        invariantsTriggered: d?.invariantsTriggered.length ?? 0,
        challenges: { solved, total: challengeList.length },
        visited: Boolean(d),
        timeSpentMs: d?.timeSpentMs ?? 0,
      };
    });
  }, [progress, attempts]);

  const totals = React.useMemo(() => {
    const engaged = rows.filter((r) => r.visited).length;
    const scenarios = rows.reduce((s, r) => s + r.scenarios.done, 0);
    const quizzes = rows.reduce((s, r) => s + r.quizzes.correct, 0);
    const quizTotal = rows.reduce((s, r) => s + r.quizzes.total, 0);
    const invariants = rows.reduce((s, r) => s + r.invariantsTriggered, 0);
    const challenges = rows.reduce((s, r) => s + r.challenges.solved, 0);
    const challengeTotal = rows.reduce((s, r) => s + r.challenges.total, 0);
    const timeMs = rows.reduce((s, r) => s + r.timeSpentMs, 0);
    return { engaged, scenarios, quizzes, quizTotal, invariants, challenges, challengeTotal, timeMs };
  }, [rows]);

  const bar = (value: number, total: number, color: string): React.JSX.Element => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div style={{ height: '8px', width: '90px', borderRadius: '4px', backgroundColor: '#1e293b', overflow: 'hidden' }}>
        <div
          style={{ height: '100%', width: `${String(total === 0 ? 0 : Math.round((value / total) * 100))}%`, backgroundColor: color }}
        />
      </div>
      <span style={{ color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>
        {value}/{total}
      </span>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#020617', color: '#f8fafc' }}>
      <LearnNav active="/analytics" />
      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', margin: '0 0 4px' }}>Learning Analytics</h1>
          <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: 0 }}>
            Cross-domain engagement across all {rows.length} registered domains. Computed locally from your own
            progress — no server telemetry, no third-party analytics.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {[
            { label: 'Domains engaged', value: `${String(totals.engaged)}/${String(rows.length)}` },
            { label: 'Scenarios completed', value: String(totals.scenarios) },
            { label: 'Quiz correct', value: `${String(totals.quizzes)}/${String(totals.quizTotal)}` },
            { label: 'Invariants triggered', value: String(totals.invariants) },
            { label: 'Challenges solved', value: `${String(totals.challenges)}/${String(totals.challengeTotal)}` },
            { label: 'Interviews completed', value: String(interviewsCompleted.length) },
            { label: 'Time invested', value: `${String(Math.round(totals.timeMs / 60000))} min` },
          ].map((s) => (
            <div
              key={s.label}
              style={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '10px', padding: '12px 18px', minWidth: '150px' }}
            >
              <div style={{ fontSize: '1.3rem', fontWeight: 800 }}>{s.value}</div>
              <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{s.label}</div>
            </div>
          ))}
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.8rem' }}>
            <caption style={{ captionSide: 'top', textAlign: 'left', color: '#94a3b8', paddingBottom: '8px' }}>
              Per-domain engagement and completion
            </caption>
            <thead>
              <tr style={{ color: '#94a3b8', textAlign: 'left' }}>
                <th scope="col" style={{ padding: '8px', borderBottom: '1px solid #334155' }}>Domain</th>
                <th scope="col" style={{ padding: '8px', borderBottom: '1px solid #334155' }}>Fidelity</th>
                <th scope="col" style={{ padding: '8px', borderBottom: '1px solid #334155' }}>Scenarios</th>
                <th scope="col" style={{ padding: '8px', borderBottom: '1px solid #334155' }}>Quiz</th>
                <th scope="col" style={{ padding: '8px', borderBottom: '1px solid #334155' }}>Challenges</th>
                <th scope="col" style={{ padding: '8px', borderBottom: '1px solid #334155' }}>Invariants</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.domainId} style={{ borderBottom: '1px solid #1e293b' }}>
                  <td style={{ padding: '8px', fontWeight: 600 }}>
                    <span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', backgroundColor: r.color, marginRight: '8px' }} />
                    <a href={`/${r.domainId}`} style={{ color: '#f8fafc' }}>{r.name}</a>
                    {!r.visited && (
                      <span style={{ marginLeft: '8px', fontSize: '0.65rem', fontWeight: 700, color: '#e2e8f0', border: '1px solid #475569', borderRadius: '4px', padding: '1px 5px' }}>
                        NEW
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '8px', color: '#94a3b8' }}>{r.fidelity}</td>
                  <td style={{ padding: '8px' }}>{bar(r.scenarios.done, r.scenarios.total, r.color)}</td>
                  <td style={{ padding: '8px' }}>{bar(r.quizzes.correct, r.quizzes.total, r.color)}</td>
                  <td style={{ padding: '8px' }}>{bar(r.challenges.solved, r.challenges.total, r.color)}</td>
                  <td style={{ padding: '8px', color: '#e2e8f0', fontVariantNumeric: 'tabular-nums' }}>{r.invariantsTriggered}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
