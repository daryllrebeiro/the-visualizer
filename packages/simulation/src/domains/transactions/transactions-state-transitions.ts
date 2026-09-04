import type { DeterministicRNG } from '../../prng/deterministic-rng.js';
import { createDefaultSagaState, stepSagaExecution } from './saga-orchestrator.js';
import type { TransactionsClusterState, TransactionsSimEvent } from './transactions-types.js';
import { createDefault2PCState, step2PCCoordinator } from './two-phase-commit.js';

export function createDefaultTransactionsCluster(
  clusterId = 'txn-cluster-1',
): TransactionsClusterState {
  return {
    clusterId,
    tick: 0,
    activeProtocol: 'TWO_PHASE_COMMIT',
    twoPhaseCommit: createDefault2PCState(),
    saga: createDefaultSagaState(),
    flawsDemonstrated: {
      twoPhaseCommitBlockingHazardDetected: false,
      mixedParticipantOutcomeDetected: false,
      outOfOrderCompensationDetected: false,
    },
  };
}

export function pureTransactionsTransition(
  state: TransactionsClusterState,
  event: TransactionsSimEvent,
  _rng: DeterministicRNG,
): { nextState: TransactionsClusterState; emittedEvents: TransactionsSimEvent[] } {
  const nextState: TransactionsClusterState = JSON.parse(
    JSON.stringify(state),
  ) as TransactionsClusterState;
  nextState.tick = event.tick;

  switch (event.type) {
    case 'TXN_2PC_START': {
      nextState.twoPhaseCommit = createDefault2PCState(event.payload.transactionId);
      nextState.twoPhaseCommit.phase = 'PREPARING';
      for (const part of Object.values(nextState.twoPhaseCommit.participants)) {
        part.state = 'PREPARING';
      }
      break;
    }

    case 'TXN_2PC_PARTICIPANT_VOTE': {
      const { participantId, vote } = event.payload;
      const part = nextState.twoPhaseCommit.participants[participantId];
      if (part) {
        part.vote = vote;
        if (vote === 'VOTE_COMMIT') {
          part.state = 'PREPARED';
        } else {
          part.state = 'ABORTED';
        }
        nextState.twoPhaseCommit.votesReceived[participantId] = vote;
      }

      nextState.twoPhaseCommit = step2PCCoordinator(nextState.twoPhaseCommit);

      // Verify mixed participant outcome check
      const states = Object.values(nextState.twoPhaseCommit.participants).map((p) => p.state);
      const hasCommitted = states.includes('COMMITTED');
      const hasAborted = states.includes('ABORTED');
      if (hasCommitted && hasAborted) {
        nextState.flawsDemonstrated.mixedParticipantOutcomeDetected = true;
      }
      break;
    }

    case 'TXN_2PC_CRASH_COORDINATOR': {
      const { crashTiming } = event.payload;
      nextState.twoPhaseCommit.phase = 'CRASHED_COORDINATOR';
      nextState.twoPhaseCommit.coordinatorCrashPoint = crashTiming;

      if (crashTiming === 'AFTER_PREPARE') {
        // Freeze all prepared participants into BLOCKED_UNCERTAIN
        for (const part of Object.values(nextState.twoPhaseCommit.participants)) {
          if (part.state === 'PREPARED') {
            part.state = 'BLOCKED_UNCERTAIN';
          }
        }
        nextState.twoPhaseCommit.finalOutcome = 'BLOCKED_UNCERTAIN';
        nextState.flawsDemonstrated.twoPhaseCommitBlockingHazardDetected = true;
      }
      break;
    }

    case 'TXN_2PC_RECOVER_COORDINATOR': {
      // Coordinator recovers from crash
      if (nextState.twoPhaseCommit.phase === 'CRASHED_COORDINATOR') {
        nextState.twoPhaseCommit.phase = 'PREPARING';
        nextState.twoPhaseCommit = step2PCCoordinator(nextState.twoPhaseCommit);
      }
      break;
    }

    case 'TXN_SAGA_START': {
      nextState.saga = createDefaultSagaState(event.payload.sagaId);
      nextState.saga.status = 'RUNNING';
      nextState.saga.steps[0]!.state = 'EXECUTING';
      break;
    }

    case 'TXN_SAGA_STEP_OUTCOME': {
      const { stepIndex, success } = event.payload;
      nextState.saga = stepSagaExecution(nextState.saga, stepIndex, success);

      // Check reverse ordering of compensation
      const expectedReverseOrder = [...nextState.saga.forwardCompletedOrder].reverse();
      const actualOrder = nextState.saga.compensationExecutedOrder;
      for (let i = 0; i < actualOrder.length; i++) {
        if (actualOrder[i] !== expectedReverseOrder[i]) {
          nextState.flawsDemonstrated.outOfOrderCompensationDetected = true;
        }
      }
      break;
    }

    case 'TXN_UPDATE_CONFIG': {
      if (event.payload.protocol !== undefined) {
        nextState.activeProtocol = event.payload.protocol;
      }
      break;
    }

    case 'TICK' as any:
    case 'TXN_TICK': {
      // Clock advance
      break;
    }
  }

  nextState.rngState = _rng.getState();
  return { nextState, emittedEvents: [] };
}
