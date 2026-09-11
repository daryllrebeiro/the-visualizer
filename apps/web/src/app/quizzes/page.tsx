'use client';

import React from 'react';

import { DOMAIN_OPTIONS } from '../domain-options';
import { LearnNav } from '../../components/learn/LearnNav';
import { QUIZ_BANK, quizForDomain } from '../../components/learn/quiz-banks';
import { QuizMode } from '../../components/learn/QuizMode';

export default function QuizzesPage(): React.JSX.Element {
  const [domainId, setDomainId] = React.useState<string>('all');
  const questions = domainId === 'all' ? QUIZ_BANK : quizForDomain(domainId);
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#020617', color: '#f8fafc' }}>
      <LearnNav active="/quizzes" />
      <main style={{ maxWidth: '900px', margin: '0 auto', padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', margin: '0 0 4px' }}>Quiz & Flashcards</h1>
          <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: 0 }}>
            Hand-authored questions tagged to the exact invariant each one tests. Reviews schedule automatically.
          </p>
        </div>
        <label style={{ color: '#94a3b8', fontSize: '0.8rem', display: 'flex', gap: '8px', alignItems: 'center' }}>
          Domain
          <select
            value={domainId}
            onChange={(e) => setDomainId(e.target.value)}
            style={{ backgroundColor: '#1e293b', color: '#f8fafc', border: '1px solid #334155', borderRadius: '8px', padding: '6px 10px' }}
          >
            <option value="all">All domains ({QUIZ_BANK.length})</option>
            {DOMAIN_OPTIONS.filter((d) => quizForDomain(d.id).length > 0).map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({quizForDomain(d.id).length})
              </option>
            ))}
          </select>
        </label>
        <QuizMode questions={questions} title={domainId === 'all' ? 'All questions' : (DOMAIN_OPTIONS.find((d) => d.id === domainId)?.name ?? domainId)} />
      </main>
    </div>
  );
}
