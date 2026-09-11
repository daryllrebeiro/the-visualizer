'use client';

import React from 'react';

import type { InterviewScript } from '@the-visualizer/contracts';

import { useLearnStore } from './learn-store';

export function InterviewMode({ script }: { script: InterviewScript }): React.JSX.Element {
  const [startedAt, setStartedAt] = React.useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = React.useState(0);
  const [currentStep, setCurrentStep] = React.useState(0);
  const [showHint, setShowHint] = React.useState(false);
  const [checked, setChecked] = React.useState<boolean[]>(() => script.steps.map(() => false));
  const [finished, setFinished] = React.useState(false);

  React.useEffect(() => {
    if (startedAt === null || finished) return;
    const t = window.setInterval(() => setElapsedMs(Date.now() - startedAt), 1000);
    return () => window.clearInterval(t);
  }, [startedAt, finished]);

  const step = script.steps[currentStep]!;
  const limitMs = script.timeLimitMinutes * 60000;
  const overTime = elapsedMs > limitMs;
  const score = checked.filter(Boolean).length;

  const mm = String(Math.floor(elapsedMs / 60000)).padStart(2, '0');
  const ss = String(Math.floor((elapsedMs % 60000) / 1000)).padStart(2, '0');

  if (startedAt === null) {
    return (
      <div style={{ border: '1px solid #334155', borderRadius: '10px', backgroundColor: '#0f172a', padding: '20px' }}>
        <h2 style={{ color: '#f8fafc', margin: '0 0 8px' }}>{script.title}</h2>
        <p style={{ color: '#e2e8f0' }}>{script.question}</p>
        <p style={{ color: '#94a3b8', fontSize: '0.82rem' }}>
          {script.steps.length} steps · {script.timeLimitMinutes}-minute timer · self-assessed rubric (no AI grading)
        </p>
        <button
          onClick={() => setStartedAt(Date.now())}
          style={{ backgroundColor: '#4f46e5', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 20px', fontWeight: 700, cursor: 'pointer' }}
        >
          Start timed session
        </button>
      </div>
    );
  }

  if (finished) {
    return (
      <div style={{ border: '1px solid #334155', borderRadius: '10px', backgroundColor: '#0f172a', padding: '20px' }}>
        <h2 style={{ color: '#f8fafc', margin: '0 0 8px' }}>Session complete — self-scored summary</h2>
        <p style={{ color: '#e2e8f0' }}>
          Rubric: {score}/{script.steps.length} · Time: {mm}:{ss}
          {overTime ? ' (over the limit — note pacing)' : ' (within the limit)'}
        </p>
        <ul style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
          {script.steps.map((s, i) => (
            <li key={s.stepId} style={{ color: checked[i] ? '#86efac' : '#fca5a5' }}>
              {checked[i] ? '✓' : '✗'} {s.rubricItem}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div style={{ border: '1px solid #334155', borderRadius: '10px', backgroundColor: '#0f172a', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong style={{ color: '#f8fafc' }}>
          Step {currentStep + 1}/{script.steps.length}: {step.title}
        </strong>
        <span style={{ color: overTime ? '#fca5a5' : '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>
          ⏱ {mm}:{ss} / {script.timeLimitMinutes}:00
        </span>
      </div>
      <p style={{ color: '#e2e8f0', margin: 0 }}>{step.instruction}</p>
      <p style={{ color: '#38bdf8', fontSize: '0.8rem', margin: 0 }}>
        Try it in <a href={`/${step.domainId}`} style={{ color: '#38bdf8' }}>/{step.domainId}</a>
      </p>
      {!showHint ? (
        <button
          onClick={() => setShowHint(true)}
          style={{ alignSelf: 'flex-start', background: 'none', border: '1px solid #334155', color: '#94a3b8', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer' }}
        >
          Show hint
        </button>
      ) : (
        <p style={{ color: '#fde68a', backgroundColor: '#1e293b', borderRadius: '8px', padding: '8px 12px', margin: 0 }}>
          💡 {step.hint || 'No hint for this step — trust your preparation.'}
        </p>
      )}
      <label style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', color: '#e2e8f0', fontSize: '0.85rem' }}>
        <input
          type="checkbox"
          checked={checked[currentStep] ?? false}
          onChange={(e) => {
            const next = [...checked];
            next[currentStep] = e.target.checked;
            setChecked(next);
          }}
        />
        Rubric: {step.rubricItem}
      </label>
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={() => {
            setCurrentStep((c) => Math.max(0, c - 1));
            setShowHint(false);
          }}
          disabled={currentStep === 0}
          style={{ backgroundColor: '#1e293b', color: '#f8fafc', border: '1px solid #334155', borderRadius: '8px', padding: '8px 14px', cursor: 'pointer', opacity: currentStep === 0 ? 0.4 : 1 }}
        >
          ← Back
        </button>
        {currentStep < script.steps.length - 1 ? (
          <button
            onClick={() => {
              setCurrentStep((c) => c + 1);
              setShowHint(false);
            }}
            style={{ backgroundColor: '#4f46e5', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 14px', cursor: 'pointer' }}
          >
            Next step →
          </button>
        ) : (
          <button
            onClick={() => {
              useLearnStore.getState().recordInterviewComplete(script.id);
              setFinished(true);
            }}
            style={{ backgroundColor: '#15803d', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 14px', cursor: 'pointer' }}
          >
            Finish & self-score
          </button>
        )}
      </div>
    </div>
  );
}
