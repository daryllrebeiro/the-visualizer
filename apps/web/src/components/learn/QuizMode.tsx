'use client';

import React from 'react';

import type { QuizQuestion } from '@the-visualizer/contracts';
import { dueCards } from '@the-visualizer/simulation';

import { useLearnStore } from './learn-store';

function QuestionCard({
  question,
  onAnswer,
  answered,
}: {
  question: QuizQuestion;
  onAnswer: (correct: boolean) => void;
  answered: { correct: boolean; attempts: number } | undefined;
}): React.JSX.Element {
  const [picked, setPicked] = React.useState<number | null>(null);
  const [flipped, setFlipped] = React.useState(false);
  const [revealed, setRevealed] = React.useState(false);

  const submitMc = (index: number) => {
    if (picked !== null) return;
    setPicked(index);
    setRevealed(true);
    onAnswer(index === question.answerIndex);
  };

  const flip = (knewIt: boolean) => {
    setFlipped(true);
    setRevealed(true);
    onAnswer(knewIt);
  };

  return (
    <article
      style={{ border: '1px solid #334155', borderRadius: '10px', backgroundColor: '#0f172a', padding: '14px' }}
    >
      <p style={{ color: '#f8fafc', fontSize: '0.9rem', fontWeight: 600, margin: '0 0 10px' }}>{question.prompt}</p>
      {question.invariantId && (
        <p style={{ color: '#38bdf8', fontSize: '0.7rem', margin: '0 0 10px' }}>
          Tests invariant {question.invariantId}
        </p>
      )}
      {question.kind === 'multiple-choice' && question.choices && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {question.choices.map((choice, i) => {
            const isAnswer = i === question.answerIndex;
            const isPicked = picked === i;
            return (
              <button
                key={i}
                onClick={() => submitMc(i)}
                disabled={picked !== null}
                style={{
                  textAlign: 'left',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  fontSize: '0.82rem',
                  cursor: picked === null ? 'pointer' : 'default',
                  backgroundColor: revealed && isAnswer ? '#14532d' : isPicked ? '#7f1d1d' : '#1e293b',
                  color: '#e2e8f0',
                  border: '1px solid #334155',
                }}
              >
                {choice}
              </button>
            );
          })}
        </div>
      )}
      {question.kind === 'flashcard' && !flipped && (
        <button
          onClick={() => setFlipped(true)}
          style={{ backgroundColor: '#334155', color: '#f8fafc', border: 'none', borderRadius: '8px', padding: '8px 14px', fontSize: '0.8rem', cursor: 'pointer' }}
        >
          Reveal answer
        </button>
      )}
      {(revealed || flipped) && (
        <div style={{ marginTop: '10px', fontSize: '0.82rem' }}>
          {question.kind === 'flashcard' && (
            <>
              <p style={{ color: '#a5f3fc', margin: '0 0 8px' }}><strong>Answer:</strong> {question.answer}</p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => flip(true)}
                  style={{ backgroundColor: '#14532d', color: '#f8fafc', border: 'none', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer' }}
                >
                  I knew it
                </button>
                <button
                  onClick={() => flip(false)}
                  style={{ backgroundColor: '#7f1d1d', color: '#f8fafc', border: 'none', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer' }}
                >
                  Missed it
                </button>
              </div>
            </>
          )}
          <p style={{ color: '#94a3b8', margin: '8px 0 0' }}>
            <strong>Why:</strong> {question.explanation}
          </p>
          {answered && (
            <p style={{ color: '#94a3b8', margin: '4px 0 0', fontSize: '0.75rem' }}>
              {answered.correct ? '✓ Correct' : '✗ Incorrect'} · {answered.attempts} attempt{answered.attempts === 1 ? '' : 's'}
            </p>
          )}
        </div>
      )}
    </article>
  );
}

export function QuizMode({
  questions,
  title,
}: {
  questions: QuizQuestion[];
  title: string;
}): React.JSX.Element {
  const progress = useLearnStore((s) => s.progress);
  const cards = useLearnStore((s) => s.cards);
  const recordQuizAnswer = useLearnStore((s) => s.recordQuizAnswer);
  const [showDueOnly, setShowDueOnly] = React.useState(false);

  const now = Date.now();
  const dueIds = new Set(
    dueCards(
      questions.map((q) => ({ id: q.id, nextReviewAt: cards[q.id]?.nextReviewAt ?? 0 })),
      now,
    ).map((c: { id: string }) => c.id),
  );
  const visible = showDueOnly ? questions.filter((q) => dueIds.has(q.id)) : questions;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <h2 style={{ color: '#f8fafc', fontSize: '1.05rem', margin: 0 }}>{title}</h2>
        <span style={{ color: '#94a3b8', fontSize: '0.78rem' }}>
          {dueIds.size} due for review
        </span>
        <label style={{ color: '#94a3b8', fontSize: '0.78rem', display: 'flex', gap: '6px', alignItems: 'center' }}>
          <input type="checkbox" checked={showDueOnly} onChange={(e) => setShowDueOnly(e.target.checked)} />
          Due only
        </label>
      </div>
      {visible.length === 0 && (
        <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Nothing due — pick a domain or clear the filter.</p>
      )}
      {visible.map((q) => {
        const record = progress.domains[q.domainId]?.quizAnswered[q.id];
        return (
          <QuestionCard
            key={q.id}
            question={q}
            answered={record ? { correct: record.correct, attempts: record.attempts } : undefined}
            onAnswer={(correct) => recordQuizAnswer(q.domainId, q.id, correct)}
          />
        );
      })}
    </div>
  );
}
