'use client';

import React from 'react';

import type {
  SagaStepDefinition,
  TransactionProtocol,
  TransactionsClusterState,
  TwoPhaseCommitParticipantRecord,
} from '@the-visualizer/simulation';

export interface TransactionsVisualizerProps {
  state: TransactionsClusterState;
  onStart2PC?: (txId: string) => void;
  onVoteParticipant?: (participantId: string, vote: 'VOTE_COMMIT' | 'VOTE_ABORT') => void;
  onCrashCoordinator?: (timing: 'AFTER_PREPARE' | 'AFTER_COMMIT') => void;
  onRecoverCoordinator?: () => void;
  onStartSaga?: (sagaId: string) => void;
  onStepSaga?: (stepIndex: number, success: boolean) => void;
  onSwitchProtocol?: (protocol: TransactionProtocol) => void;
}

export function TransactionsVisualizer({
  state,
  onStart2PC,
  onVoteParticipant,
  onCrashCoordinator,
  onRecoverCoordinator,
  onStartSaga,
  onStepSaga,
  onSwitchProtocol,
}: TransactionsVisualizerProps): React.JSX.Element {
  const tpc = state.twoPhaseCommit;
  const saga = state.saga;

  const participants: TwoPhaseCommitParticipantRecord[] = Object.values(tpc.participants);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        padding: '16px',
        gap: '16px',
        overflowY: 'auto',
      }}
    >
      {/* Top Header Banner */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: '#0f172a',
          padding: '12px 16px',
          borderRadius: '8px',
          border: '1px solid #1e293b',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div>
          <h2
            style={{
              margin: 0,
              fontSize: '1.1rem',
              color: '#f8fafc',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span>💳</span> Distributed Transactions (2PC &amp; Saga) Canvas
            <span
              style={{
                fontSize: '0.75rem',
                backgroundColor: '#1e293b',
                color: '#34d399',
                padding: '2px 8px',
                borderRadius: '4px',
              }}
            >
              Jim Gray (1978) 2PC &amp; Sagas (1987)
            </span>
          </h2>
          <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
            Active Protocol: <strong>{state.activeProtocol}</strong> · Tick:{' '}
            <strong>{state.tick}</strong>
          </span>
        </div>

        {/* Protocol Switcher */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => onSwitchProtocol?.('TWO_PHASE_COMMIT')}
            style={{
              backgroundColor: state.activeProtocol === 'TWO_PHASE_COMMIT' ? '#059669' : '#1e293b',
              color: '#f8fafc',
              border: 'none',
              borderRadius: '4px',
              padding: '6px 12px',
              fontSize: '0.8rem',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Two-Phase Commit (2PC)
          </button>
          <button
            onClick={() => onSwitchProtocol?.('SAGA_ORCHESTRATION')}
            style={{
              backgroundColor:
                state.activeProtocol === 'SAGA_ORCHESTRATION' ? '#7c3aed' : '#1e293b',
              color: '#f8fafc',
              border: 'none',
              borderRadius: '4px',
              padding: '6px 12px',
              fontSize: '0.8rem',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Saga Orchestrator
          </button>
        </div>
      </div>

      {/* Real-World Flaw Notice */}
      {state.flawsDemonstrated.twoPhaseCommitBlockingHazardDetected && (
        <div
          style={{
            backgroundColor: '#451a03',
            border: '1px solid #f59e0b',
            borderRadius: '8px',
            padding: '12px 16px',
            color: '#fef3c7',
            fontSize: '0.85rem',
          }}
        >
          <strong>
            ⚠️ Known Real-World Flaw Demonstrated (TXN-2): 2PC Coordinator Crash Blocking Hazard
          </strong>
          <p style={{ margin: '4px 0 0 0', color: '#fde68a' }}>
            Coordinator crashed while participants were in the PREPARED state. Participants cannot
            unilaterally commit or abort because they do not know if the coordinator broadcast
            commit or abort to other nodes. This demonstrates 2PC&apos;s fundamental availability
            bottleneck.
          </p>
        </div>
      )}

      {/* Protocol 1: Two-Phase Commit Swimlane */}
      {state.activeProtocol === 'TWO_PHASE_COMMIT' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div
            style={{
              backgroundColor: '#020617',
              border: '1px solid #1e293b',
              borderRadius: '8px',
              padding: '16px',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '12px',
              }}
            >
              <h3 style={{ margin: 0, fontSize: '0.95rem', color: '#f8fafc', fontWeight: 700 }}>
                2PC Swimlane Diagram (Coordinator &amp; 3 Participants)
              </h3>
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  padding: '3px 8px',
                  borderRadius: '4px',
                  backgroundColor:
                    tpc.finalOutcome === 'COMMITTED'
                      ? '#064e3b'
                      : tpc.finalOutcome === 'BLOCKED_UNCERTAIN'
                        ? '#78350f'
                        : '#7f1d1d',
                  color:
                    tpc.finalOutcome === 'COMMITTED'
                      ? '#34d399'
                      : tpc.finalOutcome === 'BLOCKED_UNCERTAIN'
                        ? '#fbbf24'
                        : '#fca5a5',
                }}
              >
                Outcome: {tpc.finalOutcome}
              </span>
            </div>

            {/* Coordinator Lane */}
            <div
              style={{
                backgroundColor: '#0f172a',
                border:
                  tpc.phase === 'CRASHED_COORDINATOR' ? '1px solid #ef4444' : '1px solid #334155',
                borderRadius: '6px',
                padding: '12px',
                marginBottom: '10px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <div style={{ fontWeight: 700, color: '#f8fafc', fontSize: '0.85rem' }}>
                  👔 Central 2PC Coordinator
                </div>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                  Phase:{' '}
                  <strong
                    style={{ color: tpc.phase === 'CRASHED_COORDINATOR' ? '#ef4444' : '#38bdf8' }}
                  >
                    {tpc.phase}
                  </strong>{' '}
                  · Tx: {tpc.transactionId}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                {tpc.phase === 'CRASHED_COORDINATOR' ? (
                  <button
                    onClick={() => onRecoverCoordinator?.()}
                    style={{
                      backgroundColor: '#10b981',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '4px',
                      padding: '6px 12px',
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                      fontWeight: 600,
                    }}
                  >
                    Recover Coordinator
                  </button>
                ) : (
                  <button
                    onClick={() => onCrashCoordinator?.('AFTER_PREPARE')}
                    style={{
                      backgroundColor: '#dc2626',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '4px',
                      padding: '6px 12px',
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                      fontWeight: 600,
                    }}
                    title="Demonstrates TXN-2 Coordinator Crash Blocking Hazard"
                  >
                    💥 Crash Coordinator (TXN-2 Hazard)
                  </button>
                )}
              </div>
            </div>

            {/* Participants Swimlanes */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '10px',
              }}
            >
              {participants.map((part) => {
                const isBlocked = part.state === 'BLOCKED_UNCERTAIN';
                return (
                  <div
                    key={part.id}
                    style={{
                      backgroundColor: '#0f172a',
                      border: isBlocked
                        ? '2px solid #f59e0b'
                        : part.state === 'COMMITTED'
                          ? '1px solid #10b981'
                          : '1px solid #334155',
                      borderRadius: '6px',
                      padding: '12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}
                  >
                    <div style={{ fontWeight: 700, color: '#f8fafc', fontSize: '0.85rem' }}>
                      {part.name}
                    </div>

                    <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                      State:{' '}
                      <strong
                        style={{
                          color: isBlocked
                            ? '#fbbf24'
                            : part.state === 'COMMITTED'
                              ? '#34d399'
                              : '#94a3b8',
                        }}
                      >
                        {part.state}
                      </strong>
                    </div>

                    <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                      Vote: <strong>{part.vote ?? 'Pending'}</strong>
                    </div>

                    {tpc.phase === 'PREPARING' && part.state === 'PREPARING' && (
                      <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                        <button
                          onClick={() => onVoteParticipant?.(part.id, 'VOTE_COMMIT')}
                          style={{
                            flex: 1,
                            backgroundColor: '#059669',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '3px',
                            padding: '4px',
                            fontSize: '0.7rem',
                            cursor: 'pointer',
                            fontWeight: 600,
                          }}
                        >
                          Vote COMMIT
                        </button>
                        <button
                          onClick={() => onVoteParticipant?.(part.id, 'VOTE_ABORT')}
                          style={{
                            flex: 1,
                            backgroundColor: '#dc2626',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '3px',
                            padding: '4px',
                            fontSize: '0.7rem',
                            cursor: 'pointer',
                            fontWeight: 600,
                          }}
                        >
                          Vote ABORT
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Quick 2PC Actions */}
            <div style={{ display: 'flex', gap: '10px', marginTop: '14px' }}>
              <button
                onClick={() => onStart2PC?.(`tx-${Date.now() % 1000}`)}
                style={{
                  backgroundColor: '#2563eb',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '6px 14px',
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                Start New 2PC Transaction
              </button>
              <button
                onClick={() => {
                  onVoteParticipant?.('part-order-svc', 'VOTE_COMMIT');
                  onVoteParticipant?.('part-payment-svc', 'VOTE_COMMIT');
                  onVoteParticipant?.('part-inventory-svc', 'VOTE_COMMIT');
                }}
                style={{
                  backgroundColor: '#059669',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '6px 14px',
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                All Vote Commit (Happy Path)
              </button>
              <button
                onClick={() => {
                  onVoteParticipant?.('part-order-svc', 'VOTE_COMMIT');
                  onVoteParticipant?.('part-payment-svc', 'VOTE_ABORT');
                  onVoteParticipant?.('part-inventory-svc', 'VOTE_COMMIT');
                }}
                style={{
                  backgroundColor: '#b45309',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '6px 14px',
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                Payment Aborts (Global Abort)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Protocol 2: Saga Orchestration & Reverse Compensation Timeline */}
      {state.activeProtocol === 'SAGA_ORCHESTRATION' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div
            style={{
              backgroundColor: '#020617',
              border: '1px solid #1e293b',
              borderRadius: '8px',
              padding: '16px',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '12px',
              }}
            >
              <h3 style={{ margin: 0, fontSize: '0.95rem', color: '#f8fafc', fontWeight: 700 }}>
                Saga Orchestrator Workflow Timeline (Strict LIFO Reverse Compensation)
              </h3>
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  padding: '3px 8px',
                  borderRadius: '4px',
                  backgroundColor:
                    saga.status === 'COMPLETED'
                      ? '#064e3b'
                      : saga.status === 'COMPENSATED'
                        ? '#78350f'
                        : '#1e3a8a',
                  color:
                    saga.status === 'COMPLETED'
                      ? '#34d399'
                      : saga.status === 'COMPENSATED'
                        ? '#fbbf24'
                        : '#93c5fd',
                }}
              >
                Saga Status: {saga.status}
              </span>
            </div>

            {/* Saga Steps Pipeline */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '10px',
                marginBottom: '14px',
              }}
            >
              {saga.steps.map((step: SagaStepDefinition, idx: number) => {
                const isSucceeded = step.state === 'SUCCEEDED';
                const isFailed = step.state === 'FAILED';
                const isCompensated = step.state === 'COMPENSATED';
                const isExecuting = step.state === 'EXECUTING';

                return (
                  <div
                    key={step.stepId}
                    style={{
                      backgroundColor: '#0f172a',
                      border: isFailed
                        ? '2px solid #ef4444'
                        : isCompensated
                          ? '2px solid #f59e0b'
                          : isSucceeded
                            ? '1px solid #10b981'
                            : '1px solid #334155',
                      borderRadius: '6px',
                      padding: '12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Step {idx + 1}</span>
                      <span
                        style={{
                          fontSize: '0.65rem',
                          fontWeight: 700,
                          color: isSucceeded
                            ? '#34d399'
                            : isFailed
                              ? '#ef4444'
                              : isCompensated
                                ? '#fbbf24'
                                : '#94a3b8',
                        }}
                      >
                        {step.state}
                      </span>
                    </div>

                    <div style={{ fontWeight: 700, color: '#f8fafc', fontSize: '0.85rem' }}>
                      {step.name}
                    </div>

                    <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontFamily: 'monospace' }}>
                      Forward: {step.forwardAction}
                    </div>

                    {isCompensated && (
                      <div
                        style={{ fontSize: '0.7rem', color: '#f59e0b', fontFamily: 'monospace' }}
                      >
                        ↩️ Compensated: {step.compensatingAction}
                      </div>
                    )}

                    {isExecuting && (
                      <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                        <button
                          onClick={() => onStepSaga?.(idx, true)}
                          style={{
                            flex: 1,
                            backgroundColor: '#059669',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '3px',
                            padding: '4px',
                            fontSize: '0.7rem',
                            cursor: 'pointer',
                            fontWeight: 600,
                          }}
                        >
                          Succeed
                        </button>
                        <button
                          onClick={() => onStepSaga?.(idx, false)}
                          style={{
                            flex: 1,
                            backgroundColor: '#dc2626',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '3px',
                            padding: '4px',
                            fontSize: '0.7rem',
                            cursor: 'pointer',
                            fontWeight: 600,
                          }}
                        >
                          Fail Step
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Compensation Order Trace */}
            {saga.compensationExecutedOrder.length > 0 && (
              <div
                style={{
                  backgroundColor: '#0f172a',
                  border: '1px solid #f59e0b',
                  borderRadius: '6px',
                  padding: '10px',
                  marginBottom: '14px',
                }}
              >
                <div
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    color: '#f59e0b',
                    marginBottom: '4px',
                  }}
                >
                  ↩️ Strict Reverse Compensation Trace (TXN-3 LIFO Order):
                </div>
                <div style={{ fontSize: '0.8rem', color: '#cbd5e1', fontFamily: 'monospace' }}>
                  {saga.compensationExecutedOrder
                    .map((sid: string, i: number) => `${i + 1}. Compensate ${sid}`)
                    .join(' ➔ ')}
                </div>
              </div>
            )}

            {/* Quick Saga Actions */}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => onStartSaga?.(`saga-${Date.now() % 1000}`)}
                style={{
                  backgroundColor: '#7c3aed',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '6px 14px',
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                Start Checkout Saga
              </button>
              <button
                onClick={() => {
                  onStepSaga?.(0, true);
                  onStepSaga?.(1, true);
                  onStepSaga?.(2, false); // Step 3 fails -> Triggers reverse unwinding!
                }}
                style={{
                  backgroundColor: '#dc2626',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '6px 14px',
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
                title="Demonstrates TXN-3 Reverse Compensation Unwinding"
              >
                Simulate Payment Decline (Trigger Reverse Unwind)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
