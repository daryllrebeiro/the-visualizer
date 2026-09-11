'use client';

import React from 'react';

import { INTERVIEW_SCRIPTS, interviewById } from '../../components/learn/interview-scripts';
import { InterviewMode } from '../../components/learn/InterviewMode';
import { LearnNav } from '../../components/learn/LearnNav';

export default function InterviewPage(): React.JSX.Element {
  const [scriptId, setScriptId] = React.useState<string>(INTERVIEW_SCRIPTS[0]!.id);
  const [sessionKey, setSessionKey] = React.useState(0);
  const script = interviewById(scriptId)!;
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#020617', color: '#f8fafc' }}>
      <LearnNav active="/interview" />
      <main style={{ maxWidth: '900px', margin: '0 auto', padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', margin: '0 0 4px' }}>Guided Interview Mode</h1>
          <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: 0 }}>
            Real named questions, timed, with progressive hints and rubric self-assessment. No AI grading.
          </p>
        </div>
        <label style={{ color: '#94a3b8', fontSize: '0.8rem', display: 'flex', gap: '8px', alignItems: 'center' }}>
          Question
          <select
            value={scriptId}
            onChange={(e) => {
              setScriptId(e.target.value);
              setSessionKey((k) => k + 1);
            }}
            style={{ backgroundColor: '#1e293b', color: '#f8fafc', border: '1px solid #334155', borderRadius: '8px', padding: '6px 10px' }}
          >
            {INTERVIEW_SCRIPTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </label>
        <InterviewMode key={sessionKey} script={script} />
      </main>
    </div>
  );
}
