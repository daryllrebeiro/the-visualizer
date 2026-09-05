'use client';

import React, { useState } from 'react';
import type { DomainKey } from '../../app/domain-options';
import { INTERVIEW_CHALLENGES, type InterviewChallenge } from './interview-challenges';

interface InterviewPrepModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLaunchDrill: (domain: DomainKey, scenarioId: string) => void;
}

export function InterviewPrepModal({
  isOpen,
  onClose,
  onLaunchDrill,
}: InterviewPrepModalProps): React.JSX.Element | null {
  const [selectedChallengeId, setSelectedChallengeId] = useState<string>(
    INTERVIEW_CHALLENGES[0]?.id ?? 'rate-limiter-burst',
  );
  const [checkedRubricItems, setCheckedRubricItems] = useState<Record<string, boolean>>({});

  if (!isOpen) return null;

  const currentChallenge: InterviewChallenge =
    INTERVIEW_CHALLENGES.find((c) => c.id === selectedChallengeId) ?? INTERVIEW_CHALLENGES[0]!;

  const toggleCheck = (id: string, index: number) => {
    const key = `${id}-${index}`;
    setCheckedRubricItems((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="interview-prep-title"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.85)',
        backdropFilter: 'blur(8px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '1100px',
          height: '85vh',
          backgroundColor: '#0f172a',
          border: '1px solid #334155',
          borderRadius: '16px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.05)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          color: '#f8fafc',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Top Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 24px',
            borderBottom: '1px solid #1e293b',
            backgroundColor: '#090d16',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '1.4rem' }}>🎓</span>
            <div>
              <h2
                id="interview-prep-title"
                style={{
                  margin: 0,
                  fontSize: '1.1rem',
                  fontWeight: 700,
                  letterSpacing: '-0.01em',
                  color: '#f8fafc',
                }}
              >
                System Design Interview Canon & Evaluation Drills
              </h2>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                FAANG / Tier-1 Principal Engineering Curated Scenarios with Live Simulation Verification
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close interview prep"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: '1.25rem',
              cursor: 'pointer',
              padding: '4px 8px',
              borderRadius: '6px',
            }}
          >
            ✕
          </button>
        </div>

        {/* Modal Body: Left Sidebar + Right Content */}
        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          {/* Left Challenge Directory */}
          <div
            style={{
              width: '320px',
              borderRight: '1px solid #1e293b',
              backgroundColor: '#0b1120',
              overflowY: 'auto',
              padding: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            <div
              style={{
                fontSize: '0.7rem',
                textTransform: 'uppercase',
                fontWeight: 700,
                color: '#64748b',
                padding: '4px 8px',
                letterSpacing: '0.05em',
              }}
            >
              Curated Challenges ({INTERVIEW_CHALLENGES.length})
            </div>

            {INTERVIEW_CHALLENGES.map((ch) => {
              const isSelected = ch.id === selectedChallengeId;
              const difficultyColor = ch.difficulty === 'Hard' ? '#f43f5e' : '#f59e0b';
              return (
                <button
                  key={ch.id}
                  onClick={() => setSelectedChallengeId(ch.id)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    textAlign: 'left',
                    gap: '4px',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    backgroundColor: isSelected ? '#1e293b' : 'transparent',
                    border: isSelected ? '1px solid #38bdf844' : '1px solid transparent',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      width: '100%',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '0.65rem',
                        fontWeight: 700,
                        color: difficultyColor,
                        backgroundColor: difficultyColor + '18',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        border: `1px solid ${difficultyColor}33`,
                      }}
                    >
                      {ch.difficulty}
                    </span>
                    <span style={{ fontSize: '0.65rem', color: '#64748b', fontFamily: 'monospace' }}>
                      {ch.domain}
                    </span>
                  </div>
                  <div
                    style={{
                      fontWeight: isSelected ? 700 : 500,
                      fontSize: '0.85rem',
                      color: isSelected ? '#f8fafc' : '#cbd5e1',
                      lineHeight: 1.3,
                    }}
                  >
                    {ch.title}
                  </div>
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '2px' }}>
                    {ch.companyTags.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        style={{
                          fontSize: '0.6rem',
                          color: '#94a3b8',
                          backgroundColor: '#1e293b88',
                          padding: '1px 5px',
                          borderRadius: '3px',
                        }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Right Challenge Detail Pane */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '24px 32px',
              display: 'flex',
              flexDirection: 'column',
              gap: '20px',
            }}
          >
            {/* Header section */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <span
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      color: currentChallenge.difficulty === 'Hard' ? '#f43f5e' : '#f59e0b',
                      backgroundColor:
                        (currentChallenge.difficulty === 'Hard' ? '#f43f5e' : '#f59e0b') + '22',
                      padding: '2px 8px',
                      borderRadius: '4px',
                    }}
                  >
                    {currentChallenge.difficulty}
                  </span>
                  <span
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      color: '#38bdf8',
                      backgroundColor: '#38bdf822',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      border: '1px solid #38bdf844',
                    }}
                  >
                    Domain: {currentChallenge.domain.toUpperCase()}
                  </span>
                </div>
                <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: '#f8fafc' }}>
                  {currentChallenge.title}
                </h1>
                <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Commonly asked at:</span>
                  {currentChallenge.companyTags.map((t) => (
                    <span
                      key={t}
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        color: '#cbd5e1',
                        backgroundColor: '#1e293b',
                        padding: '1px 6px',
                        borderRadius: '4px',
                      }}
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>

              {/* Action drill button */}
              <button
                onClick={() => {
                  onLaunchDrill(currentChallenge.domain, currentChallenge.scenarioId);
                  onClose();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  backgroundColor: '#4f46e5',
                  color: '#ffffff',
                  border: 'none',
                  padding: '10px 18px',
                  borderRadius: '8px',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(79, 70, 229, 0.4)',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#4338ca')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#4f46e5')}
              >
                {currentChallenge.drillLabel}
              </button>
            </div>

            {/* Problem Statement & SLA */}
            <div
              style={{
                backgroundColor: '#1e293b44',
                border: '1px solid #334155',
                borderRadius: '10px',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
                Problem Statement
              </div>
              <div style={{ fontSize: '0.9rem', color: '#e2e8f0', lineHeight: 1.5 }}>
                {currentChallenge.problemStatement}
              </div>
              <div
                style={{
                  marginTop: '6px',
                  paddingTop: '8px',
                  borderTop: '1px solid #33415555',
                  fontSize: '0.8rem',
                  color: '#38bdf8',
                  fontFamily: 'monospace',
                }}
              >
                <strong>Target SLA:</strong> {currentChallenge.sla}
              </div>
            </div>

            {/* Architecture Building Blocks */}
            <div>
              <div
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  color: '#94a3b8',
                  textTransform: 'uppercase',
                  marginBottom: '8px',
                }}
              >
                Key Architecture Components
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                {currentChallenge.components.map((comp, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      backgroundColor: '#1e293b66',
                      border: '1px solid #334155',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      fontSize: '0.8rem',
                      color: '#cbd5e1',
                    }}
                  >
                    <span style={{ color: '#10b981' }}>✓</span>
                    <span>{comp}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Deep Technical Tradeoffs */}
            <div>
              <div
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  color: '#94a3b8',
                  textTransform: 'uppercase',
                  marginBottom: '8px',
                }}
              >
                Core Tradeoff Analysis
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {currentChallenge.tradeoffs.map((t, idx) => (
                  <div
                    key={idx}
                    style={{
                      backgroundColor: '#182234',
                      border: '1px solid #293548',
                      borderRadius: '8px',
                      padding: '12px 14px',
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#f59e0b', marginBottom: '4px' }}>
                      ⚖️ {t.title}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#94a3b8', lineHeight: 1.45 }}>
                      {t.description}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Interviewer Rubric Checklist (Interactive) */}
            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '8px',
                }}
              >
                <div
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    color: '#94a3b8',
                    textTransform: 'uppercase',
                  }}
                >
                  Interviewer Evaluation Rubric (Self-Assessment)
                </div>
                <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
                  Check off items you discussed during practice
                </span>
              </div>
              <div
                style={{
                  backgroundColor: '#111827',
                  border: '1px solid #1f2937',
                  borderRadius: '8px',
                  padding: '12px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                {currentChallenge.interviewerChecklist.map((item, idx) => {
                  const isChecked = checkedRubricItems[`${currentChallenge.id}-${idx}`] ?? false;
                  return (
                    <label
                      key={idx}
                      onClick={() => toggleCheck(currentChallenge.id, idx)}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '10px',
                        cursor: 'pointer',
                        fontSize: '0.8rem',
                        color: isChecked ? '#94a3b8' : '#e2e8f0',
                        textDecoration: isChecked ? 'line-through' : 'none',
                        lineHeight: 1.4,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {}}
                        style={{ marginTop: '2px', cursor: 'pointer' }}
                      />
                      <span>{item}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Architectural Blueprint Summary */}
            <div
              style={{
                backgroundColor: '#0c1a2e',
                border: '1px solid #1e3a8a',
                borderRadius: '8px',
                padding: '14px',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: '0.8rem', color: '#60a5fa', marginBottom: '4px' }}>
                💡 Principal Engineering Blueprint
              </div>
              <div style={{ fontSize: '0.8rem', color: '#bfdbfe', lineHeight: 1.45 }}>
                {currentChallenge.solutionSummary}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
