'use client';

import React from 'react';

import type { Challenge } from '@the-visualizer/contracts';

import { useLearnStore } from './learn-store';

export function ChallengeMode({ challenge }: { challenge: Challenge }): React.JSX.Element {
  const recordChallengeAttempt = useLearnStore((s) => s.recordChallengeAttempt);
  const stored = useLearnStore((s) => s.attempts[challenge.id]);
  const recordInvariant = useLearnStore((s) => s.recordInvariant);

  const [startedAt, setStartedAt] = React.useState<number | null>(null);
  const [hintsShown, setHintsShown] = React.useState(0);
  const [revealed, setRevealed] = React.useState(false);
  const [done, setDone] = React.useState(false);

  const solve = (solved: boolean) => {
    const elapsedMs = startedAt === null ? 0 : Date.now() - startedAt;
    recordChallengeAttempt({ challengeId: challenge.id, solved, hintsUsed: hintsShown, elapsedMs });
    if (solved) recordInvariant(challenge.domainId, challenge.invariantId);
    setDone(true);
  };

  if (startedAt === null) {
    return (
      <div style={{ border: '1px solid #334155', borderRadius: '10px', backgroundColor: '#0f172a', padding: '20px' }}>
        <h2 style={{ color: '#f8fafc', margin: '0 0 8px' }}>{challenge.title}</h2>
        <p style={{ color: '#e2e8f0' }}>{challenge.brief}</p>
        <p style={{ color: '#94a3b8', fontSize: '0.8rem' }}>
          Target invariant: <strong style={{ color: '#38bdf8' }}>{challenge.invariantId}</strong>
          {challenge.chaosScenarioId ? ` · try chaos scenario ${challenge.chaosScenarioId}` : ''}
        </p>
        {stored && (
          <p style={{ color: '#94a3b8', fontSize: '0.8rem' }}>
            Previous attempt: {stored.solved ? 'solved' : 'unsolved'} · {stored.hintsUsed} hint{stored.hintsUsed === 1 ? '' : 's'} ·{' '}
            {Math.round(stored.elapsedMs / 1000)}s
          </p>
        )}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setStartedAt(Date.now())}
            style={{ backgroundColor: '#4f46e5', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 20px', fontWeight: 700, cursor: 'pointer' }}
          >
            Accept the challenge
          </button>
          <a
            href={`/${challenge.domainId}`}
            style={{ alignSelf: 'center', color: '#38bdf8', fontSize: '0.85rem' }}
          >
            Open /{challenge.domainId} to hunt →
          </a>
        </div>
      </div>
    );
  }

  if (done || revealed) {
    return (
      <div style={{ border: '1px solid #334155', borderRadius: '10px', backgroundColor: '#0f172a', padding: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <h2 style={{ color: '#f8fafc', margin: 0 }}>{done && !revealed ? 'Solved 🎉' : 'Reveal'}</h2>
        <p style={{ color: '#e2e8f0', margin: 0 }}><strong>Why it happens:</strong> {challenge.explanation}</p>
        <p style={{ color: '#e2e8f0', margin: 0 }}><strong>Real-world mitigation:</strong> {challenge.mitigation}</p>
        <button
          onClick={() => {
            setStartedAt(null);
            setHintsShown(0);
            setRevealed(false);
            setDone(false);
          }}
          style={{ alignSelf: 'flex-start', backgroundColor: '#1e293b', color: '#f8fafc', border: '1px solid #334155', borderRadius: '8px', padding: '8px 14px', cursor: 'pointer' }}
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div style={{ border: '1px solid #334155', borderRadius: '10px', backgroundColor: '#0f172a', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <p style={{ color: '#e2e8f0', margin: 0 }}>{challenge.brief}</p>
      <div>
        {challenge.hints.slice(0, hintsShown).map((h, i) => (
          <p key={i} style={{ color: '#fde68a', backgroundColor: '#1e293b', borderRadius: '8px', padding: '8px 12px', fontSize: '0.82rem' }}>
            💡 Hint {i + 1}: {h}
          </p>
        ))}
        {hintsShown < challenge.hints.length && (
          <button
            onClick={() => setHintsShown((h) => h + 1)}
            style={{ background: 'none', border: '1px solid #334155', color: '#94a3b8', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer' }}
          >
            Unlock hint {hintsShown + 1}/{challenge.hints.length}
          </button>
        )}
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={() => solve(true)}
          style={{ backgroundColor: '#15803d', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 16px', fontWeight: 700, cursor: 'pointer' }}
        >
          I found the violation
        </button>
        <button
          onClick={() => {
            solve(false);
            setRevealed(true);
          }}
          style={{ backgroundColor: '#1e293b', color: '#f8fafc', border: '1px solid #334155', borderRadius: '8px', padding: '8px 16px', cursor: 'pointer' }}
        >
          Give up & reveal
        </button>
      </div>
    </div>
  );
}
