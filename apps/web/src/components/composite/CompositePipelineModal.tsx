'use client';

import React, { useState } from 'react';
import type { DomainKey } from '../../app/domain-options';
import { COMPOSITE_PIPELINES, type CompositePipeline, type PipelineStage } from './composite-pipelines';

interface CompositePipelineModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectDomain: (domain: DomainKey) => void;
  onRunStageDrill: (domain: DomainKey, scenarioId?: string) => void;
}

export function CompositePipelineModal({
  isOpen,
  onClose,
  onSelectDomain,
  onRunStageDrill,
}: CompositePipelineModalProps): React.JSX.Element | null {
  const [selectedPipelineId, setSelectedPipelineId] = useState<string>(
    COMPOSITE_PIPELINES[0]?.id ?? 'ai-serving-pipeline',
  );
  const [activeStageIndex, setActiveStageIndex] = useState<number>(0);

  if (!isOpen) return null;

  const currentPipeline: CompositePipeline =
    COMPOSITE_PIPELINES.find((p) => p.id === selectedPipelineId) ?? COMPOSITE_PIPELINES[0]!;

  const currentStage: PipelineStage =
    currentPipeline.stages[activeStageIndex] ?? currentPipeline.stages[0]!;

  const totalStages = currentPipeline.stages.length;
  const cumulativeLatency = currentPipeline.stages
    .slice(0, activeStageIndex + 1)
    .reduce((sum, s) => sum + s.latencyBudgetMs, 0);
  const totalPipelineBudget = currentPipeline.stages.reduce((sum, s) => sum + s.latencyBudgetMs, 0);

  const handleSelectPipeline = (pipelineId: string) => {
    setSelectedPipelineId(pipelineId);
    setActiveStageIndex(0);
  };

  const handleNextStage = () => {
    if (activeStageIndex < totalStages - 1) {
      setActiveStageIndex((prev) => prev + 1);
    }
  };

  const handlePrevStage = () => {
    if (activeStageIndex > 0) {
      setActiveStageIndex((prev) => prev - 1);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="composite-pipeline-title"
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
          maxWidth: '1080px',
          height: '84vh',
          backgroundColor: '#0b1120',
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
        {/* Top Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 24px',
            borderBottom: '1px solid #1e293b',
            backgroundColor: '#080c14',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '1.4rem' }}>🔀</span>
            <div>
              <h2
                id="composite-pipeline-title"
                style={{
                  margin: 0,
                  fontSize: '1.1rem',
                  fontWeight: 700,
                  letterSpacing: '-0.01em',
                  color: '#f8fafc',
                }}
              >
                Multi-Domain Composite System Pipelines
              </h2>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                End-to-End Architectural Workflows Across Ingestion, Caching, Consensus, Storage & AI Infra
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close pipeline modal"
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

        {/* Pipeline Tabs Bar */}
        <div
          style={{
            display: 'flex',
            gap: '8px',
            padding: '12px 24px',
            backgroundColor: '#0d1527',
            borderBottom: '1px solid #1e293b',
          }}
        >
          {COMPOSITE_PIPELINES.map((pipe) => {
            const isSelected = pipe.id === selectedPipelineId;
            return (
              <button
                key={pipe.id}
                onClick={() => handleSelectPipeline(pipe.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 14px',
                  borderRadius: '8px',
                  backgroundColor: isSelected ? '#1e293b' : 'transparent',
                  border: isSelected ? `1px solid ${pipe.color}` : '1px solid transparent',
                  color: isSelected ? '#ffffff' : '#94a3b8',
                  fontWeight: isSelected ? 700 : 500,
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: pipe.color,
                  }}
                />
                <span>{pipe.title}</span>
                <span
                  style={{
                    fontSize: '0.65rem',
                    padding: '1px 6px',
                    borderRadius: '4px',
                    backgroundColor: pipe.color + '22',
                    color: pipe.color,
                  }}
                >
                  {pipe.badge}
                </span>
              </button>
            );
          })}
        </div>

        {/* Modal Main Body */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '24px 32px',
            display: 'flex',
            flexDirection: 'column',
            gap: '24px',
          }}
        >
          {/* Pipeline Overview Card */}
          <div
            style={{
              backgroundColor: '#131d31',
              border: `1px solid ${currentPipeline.color}33`,
              borderRadius: '12px',
              padding: '18px 22px',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span
                  style={{
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    color: currentPipeline.color,
                    letterSpacing: '0.05em',
                  }}
                >
                  {currentPipeline.badge}
                </span>
                <h3 style={{ margin: '4px 0 6px 0', fontSize: '1.25rem', fontWeight: 800, color: '#f8fafc' }}>
                  {currentPipeline.title}
                </h3>
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#cbd5e1', lineHeight: 1.45 }}>
                  {currentPipeline.description}
                </p>
              </div>
              <div
                style={{
                  textAlign: 'right',
                  fontFamily: 'monospace',
                  fontSize: '0.75rem',
                  color: '#38bdf8',
                  backgroundColor: '#0b1322',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid #1e293b',
                  minWidth: '220px',
                }}
              >
                <div>
                  <strong>Cumulative Latency:</strong> {cumulativeLatency}ms / {totalPipelineBudget}ms
                </div>
                <div style={{ color: '#94a3b8', marginTop: '2px' }}>
                  Progress: Stage {activeStageIndex + 1} of {totalStages}
                </div>
              </div>
            </div>

            <div
              style={{
                marginTop: '12px',
                paddingTop: '10px',
                borderTop: '1px solid #1e293b',
                fontSize: '0.75rem',
                color: '#94a3b8',
              }}
            >
              🎯 <strong>Target SLA:</strong> {currentPipeline.targetSla}
            </div>
          </div>

          {/* Interactive Topology Stepper Chain */}
          <div>
            <div
              style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                color: '#94a3b8',
                textTransform: 'uppercase',
                marginBottom: '10px',
              }}
            >
              Pipeline Topology & In-Flight Flow
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                overflowX: 'auto',
                paddingBottom: '8px',
              }}
            >
              {currentPipeline.stages.map((stage, idx) => {
                const isCurrent = idx === activeStageIndex;
                const isPast = idx < activeStageIndex;
                const border = isCurrent
                  ? `2px solid ${currentPipeline.color}`
                  : isPast
                  ? '1px solid #10b981'
                  : '1px solid #334155';
                const bg = isCurrent ? '#1e293b' : isPast ? '#0f1f1d' : '#111827';

                return (
                  <React.Fragment key={stage.id}>
                    <button
                      onClick={() => setActiveStageIndex(idx)}
                      style={{
                        flex: '1 0 190px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                        padding: '12px 14px',
                        borderRadius: '10px',
                        border,
                        backgroundColor: bg,
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '1.2rem' }}>{stage.icon}</span>
                        <span
                          style={{
                            fontSize: '0.65rem',
                            fontWeight: 700,
                            padding: '1px 5px',
                            borderRadius: '4px',
                            backgroundColor: isCurrent ? currentPipeline.color + '22' : '#1e293b',
                            color: isCurrent ? currentPipeline.color : '#94a3b8',
                          }}
                        >
                          {stage.domain.toUpperCase()}
                        </span>
                      </div>
                      <div
                        style={{
                          fontWeight: isCurrent ? 700 : 500,
                          fontSize: '0.85rem',
                          color: isCurrent ? '#ffffff' : '#cbd5e1',
                          lineHeight: 1.25,
                        }}
                      >
                        {stage.name}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: '#64748b', fontFamily: 'monospace' }}>
                        ~{stage.latencyBudgetMs}ms budget
                      </div>
                    </button>
                    {idx < totalStages - 1 && (
                      <span
                        style={{
                          fontSize: '1rem',
                          color: isPast ? '#10b981' : '#475569',
                          fontWeight: 'bold',
                        }}
                      >
                        ➜
                      </span>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* Active Stage Deep-Dive Card */}
          <div
            style={{
              backgroundColor: '#0f172a',
              border: '1px solid #1e293b',
              borderRadius: '12px',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '1.6rem' }}>{currentStage.icon}</span>
                <div>
                  <span style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase' }}>
                    Stage {activeStageIndex + 1} of {totalStages} · Domain: {currentStage.domain.toUpperCase()}
                  </span>
                  <h4 style={{ margin: '2px 0 0 0', fontSize: '1.15rem', color: '#f8fafc', fontWeight: 800 }}>
                    {currentStage.name}
                  </h4>
                </div>
              </div>

              {/* Action Button: Jump to domain & execute */}
              <button
                onClick={() => {
                  onSelectDomain(currentStage.domain);
                  onRunStageDrill(currentStage.domain, currentStage.scenarioId);
                  onClose();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  backgroundColor: currentPipeline.color,
                  color: '#0f172a',
                  border: 'none',
                  padding: '9px 16px',
                  borderRadius: '8px',
                  fontWeight: 800,
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  boxShadow: `0 4px 12px ${currentPipeline.color}44`,
                  transition: 'all 0.15s ease',
                }}
              >
                <span>▶ Jump to {currentStage.domain.toUpperCase()} & Run Drill</span>
              </button>
            </div>

            <p style={{ margin: 0, fontSize: '0.85rem', color: '#cbd5e1', lineHeight: 1.45 }}>
              {currentStage.description}
            </p>

            {/* Input vs Output contract grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
              <div
                style={{
                  backgroundColor: '#0a0f1d',
                  border: '1px solid #1e293b',
                  borderRadius: '8px',
                  padding: '12px',
                }}
              >
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase' }}>
                  📥 Stage Input Payload
                </div>
                <div style={{ fontSize: '0.8rem', color: '#e2e8f0', marginTop: '4px', fontFamily: 'monospace' }}>
                  {currentStage.inputPayload}
                </div>
              </div>

              <div
                style={{
                  backgroundColor: '#0a0f1d',
                  border: '1px solid #1e293b',
                  borderRadius: '8px',
                  padding: '12px',
                }}
              >
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#10b981', textTransform: 'uppercase' }}>
                  📤 Stage Output Payload
                </div>
                <div style={{ fontSize: '0.8rem', color: '#e2e8f0', marginTop: '4px', fontFamily: 'monospace' }}>
                  {currentStage.outputPayload}
                </div>
              </div>
            </div>

            {/* Action Summary */}
            <div
              style={{
                backgroundColor: '#111e33',
                border: '1px solid #1e3a8a',
                borderRadius: '8px',
                padding: '12px 16px',
                fontSize: '0.8rem',
                color: '#bfdbfe',
              }}
            >
              <strong>⚡ Pipeline Execution Action:</strong> {currentStage.actionSummary}
            </div>
          </div>
        </div>

        {/* Modal Stepper Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 24px',
            backgroundColor: '#080c14',
            borderTop: '1px solid #1e293b',
          }}
        >
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={handlePrevStage}
              disabled={activeStageIndex === 0}
              className="btn btn--secondary"
              style={{
                padding: '8px 14px',
                fontSize: '0.8rem',
                opacity: activeStageIndex === 0 ? 0.4 : 1,
                cursor: activeStageIndex === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              ◀ Previous Stage
            </button>
            <button
              onClick={handleNextStage}
              disabled={activeStageIndex === totalStages - 1}
              className="btn btn--secondary"
              style={{
                padding: '8px 14px',
                fontSize: '0.8rem',
                opacity: activeStageIndex === totalStages - 1 ? 0.4 : 1,
                cursor: activeStageIndex === totalStages - 1 ? 'not-allowed' : 'pointer',
              }}
            >
              Next Stage ▶
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={() => setActiveStageIndex(0)}
              className="btn btn--ghost"
              style={{ fontSize: '0.8rem' }}
            >
              🔄 Reset Stepper
            </button>
            <button
              onClick={onClose}
              className="btn btn--primary"
              style={{ padding: '8px 18px', fontSize: '0.8rem' }}
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
