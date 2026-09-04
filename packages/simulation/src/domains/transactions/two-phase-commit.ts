import type { TwoPhaseCommitState } from './transactions-types.js';

export function createDefault2PCState(transactionId = 'tx-101'): TwoPhaseCommitState {
  return {
    transactionId,
    phase: 'INIT',
    participants: {
      'part-order-svc': {
        id: 'part-order-svc',
        name: 'Order Service',
        state: 'IDLE',
        vote: null,
        status: 'ONLINE',
      },
      'part-payment-svc': {
        id: 'part-payment-svc',
        name: 'Payment Service',
        state: 'IDLE',
        vote: null,
        status: 'ONLINE',
      },
      'part-inventory-svc': {
        id: 'part-inventory-svc',
        name: 'Inventory Service',
        state: 'IDLE',
        vote: null,
        status: 'ONLINE',
      },
    },
    votesReceived: {},
    coordinatorCrashPoint: 'NONE',
    finalOutcome: 'PENDING',
  };
}

/**
 * Steps 2PC Coordinator after votes are received.
 */
export function step2PCCoordinator(state: TwoPhaseCommitState): TwoPhaseCommitState {
  const next: TwoPhaseCommitState = JSON.parse(JSON.stringify(state)) as TwoPhaseCommitState;

  if (next.phase === 'CRASHED_COORDINATOR') {
    // Coordinator is dead: if crash occurred after PREPARE, participants that voted COMMIT freeze in BLOCKED_UNCERTAIN!
    for (const part of Object.values(next.participants)) {
      if (part.state === 'PREPARED') {
        part.state = 'BLOCKED_UNCERTAIN';
      }
    }
    next.finalOutcome = 'BLOCKED_UNCERTAIN';
    return next;
  }

  const participantList = Object.values(next.participants);
  const totalCount = participantList.length;
  const votes = Object.values(next.votesReceived);

  if (votes.length < totalCount) {
    return next; // Waiting for more votes
  }

  const hasAbort = votes.some((v) => v === 'VOTE_ABORT');

  if (hasAbort) {
    // Global Abort
    next.phase = 'ABORTING';
    for (const part of Object.values(next.participants)) {
      part.state = 'ABORTED';
    }
    next.phase = 'ABORTED';
    next.finalOutcome = 'ABORTED';
  } else {
    // Global Commit
    next.phase = 'COMMITTING';
    for (const part of Object.values(next.participants)) {
      part.state = 'COMMITTED';
    }
    next.phase = 'COMMITTED';
    next.finalOutcome = 'COMMITTED';
  }

  return next;
}
