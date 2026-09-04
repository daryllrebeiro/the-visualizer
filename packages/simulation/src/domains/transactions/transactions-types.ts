/**
 * Distributed Transactions Simulation Types & State Model
 *
 * References:
 * - Jim Gray (1978): Notes on Data Base Operating Systems (Two-Phase Commit)
 * - Hector Garcia-Molina & Kenneth Salem (1987): Sagas
 * - Chris Richardson: Microservices Patterns (Saga Orchestration & Choreography)
 */

export type TransactionProtocol = 'TWO_PHASE_COMMIT' | 'SAGA_ORCHESTRATION' | 'SAGA_CHOREOGRAPHY';

export type TwoPhaseCommitCoordinatorPhase =
  | 'INIT'
  | 'PREPARING'
  | 'ALL_PREPARED'
  | 'COMMITTING'
  | 'COMMITTED'
  | 'ABORTING'
  | 'ABORTED'
  | 'CRASHED_COORDINATOR';

export type TwoPhaseCommitParticipantState =
  'IDLE' | 'PREPARING' | 'PREPARED' | 'BLOCKED_UNCERTAIN' | 'COMMITTED' | 'ABORTED';

export interface TwoPhaseCommitParticipantRecord {
  id: string;
  name: string;
  state: TwoPhaseCommitParticipantState;
  vote: 'VOTE_COMMIT' | 'VOTE_ABORT' | null;
  status: 'ONLINE' | 'CRASHED';
}

export interface TwoPhaseCommitState {
  transactionId: string;
  phase: TwoPhaseCommitCoordinatorPhase;
  participants: Record<string, TwoPhaseCommitParticipantRecord>;
  votesReceived: Record<string, 'VOTE_COMMIT' | 'VOTE_ABORT'>;
  coordinatorCrashPoint: 'NONE' | 'AFTER_PREPARE' | 'AFTER_COMMIT';
  finalOutcome: 'PENDING' | 'COMMITTED' | 'ABORTED' | 'BLOCKED_UNCERTAIN';
}

export interface SagaStepDefinition {
  stepId: string;
  name: string;
  forwardAction: string;
  compensatingAction: string;
  state: 'PENDING' | 'EXECUTING' | 'SUCCEEDED' | 'FAILED' | 'COMPENSATING' | 'COMPENSATED';
}

export interface SagaExecutionState {
  sagaId: string;
  steps: SagaStepDefinition[];
  currentStepIndex: number;
  status: 'NOT_STARTED' | 'RUNNING' | 'COMPLETED' | 'COMPENSATING' | 'COMPENSATED';
  forwardCompletedOrder: string[];
  compensationExecutedOrder: string[];
}

export interface TransactionsClusterState {
  clusterId: string;
  tick: number;
  rngState?: number;
  activeProtocol: TransactionProtocol;
  twoPhaseCommit: TwoPhaseCommitState;
  saga: SagaExecutionState;
  flawsDemonstrated: {
    twoPhaseCommitBlockingHazardDetected: boolean;
    mixedParticipantOutcomeDetected: boolean;
    outOfOrderCompensationDetected: boolean;
  };
}

export type TransactionsSimEvent =
  | {
      id: string;
      tick: number;
      type: 'TXN_2PC_START';
      payload: {
        transactionId: string;
      };
    }
  | {
      id: string;
      tick: number;
      type: 'TXN_2PC_PARTICIPANT_VOTE';
      payload: {
        participantId: string;
        vote: 'VOTE_COMMIT' | 'VOTE_ABORT';
      };
    }
  | {
      id: string;
      tick: number;
      type: 'TXN_2PC_CRASH_COORDINATOR';
      payload: {
        crashTiming: 'AFTER_PREPARE' | 'AFTER_COMMIT';
      };
    }
  | {
      id: string;
      tick: number;
      type: 'TXN_2PC_RECOVER_COORDINATOR';
      payload: Record<string, unknown>;
    }
  | {
      id: string;
      tick: number;
      type: 'TXN_SAGA_START';
      payload: {
        sagaId: string;
      };
    }
  | {
      id: string;
      tick: number;
      type: 'TXN_SAGA_STEP_OUTCOME';
      payload: {
        stepIndex: number;
        success: boolean;
      };
    }
  | {
      id: string;
      tick: number;
      type: 'TXN_UPDATE_CONFIG';
      payload: {
        protocol?: TransactionProtocol;
      };
    }
  | {
      id: string;
      tick: number;
      type: 'TXN_TICK';
      payload: Record<string, unknown>;
    };
