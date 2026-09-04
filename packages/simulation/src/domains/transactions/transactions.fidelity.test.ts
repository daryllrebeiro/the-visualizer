import { describe, expect, it } from 'vitest';

import { DeterministicRNG } from '../../prng/deterministic-rng.js';
import { TransactionsInvariantChecker } from './transactions-invariants.js';
import {
  createDefaultTransactionsCluster,
  pureTransactionsTransition,
} from './transactions-state-transitions.js';

describe('Distributed Transactions Domain Fidelity Suite', () => {
  const rng = new DeterministicRNG(42);
  const checker = new TransactionsInvariantChecker();

  it('TXN-1: 2PC Atomicity — All commit when all participants vote COMMIT', () => {
    let state = createDefaultTransactionsCluster();

    // Start 2PC
    state = pureTransactionsTransition(
      state,
      { id: 'start-tx', tick: 1, type: 'TXN_2PC_START', payload: { transactionId: 'tx-201' } },
      rng,
    ).nextState;

    // All 3 participants vote COMMIT
    for (const partId of ['part-order-svc', 'part-payment-svc', 'part-inventory-svc']) {
      state = pureTransactionsTransition(
        state,
        {
          id: `vote-${partId}`,
          tick: 2,
          type: 'TXN_2PC_PARTICIPANT_VOTE',
          payload: { participantId: partId, vote: 'VOTE_COMMIT' },
        },
        rng,
      ).nextState;
    }

    // All participants reached COMMITTED state
    expect(state.twoPhaseCommit.finalOutcome).toBe('COMMITTED');
    for (const part of Object.values(state.twoPhaseCommit.participants)) {
      expect(part.state).toBe('COMMITTED');
    }

    const v = checker.check(state);
    expect(v).toBeUndefined();
  });

  it('TXN-1: 2PC Atomicity — Aborts all when a single participant votes ABORT', () => {
    let state = createDefaultTransactionsCluster();

    state = pureTransactionsTransition(
      state,
      {
        id: 'start-tx-abort',
        tick: 1,
        type: 'TXN_2PC_START',
        payload: { transactionId: 'tx-202' },
      },
      rng,
    ).nextState;

    state = pureTransactionsTransition(
      state,
      {
        id: 'vote-1',
        tick: 2,
        type: 'TXN_2PC_PARTICIPANT_VOTE',
        payload: { participantId: 'part-order-svc', vote: 'VOTE_COMMIT' },
      },
      rng,
    ).nextState;
    // Payment service aborts (insufficient funds)
    state = pureTransactionsTransition(
      state,
      {
        id: 'vote-2',
        tick: 2,
        type: 'TXN_2PC_PARTICIPANT_VOTE',
        payload: { participantId: 'part-payment-svc', vote: 'VOTE_ABORT' },
      },
      rng,
    ).nextState;
    state = pureTransactionsTransition(
      state,
      {
        id: 'vote-3',
        tick: 2,
        type: 'TXN_2PC_PARTICIPANT_VOTE',
        payload: { participantId: 'part-inventory-svc', vote: 'VOTE_COMMIT' },
      },
      rng,
    ).nextState;

    expect(state.twoPhaseCommit.finalOutcome).toBe('ABORTED');
    for (const part of Object.values(state.twoPhaseCommit.participants)) {
      expect(part.state).toBe('ABORTED');
    }
  });

  it('TXN-2: Demonstrates 2PC Coordinator Crash Blocking Hazard', () => {
    let state = createDefaultTransactionsCluster();

    state = pureTransactionsTransition(
      state,
      {
        id: 'start-tx-block',
        tick: 1,
        type: 'TXN_2PC_START',
        payload: { transactionId: 'tx-203' },
      },
      rng,
    ).nextState;

    // Participants vote commit and enter PREPARED
    state = pureTransactionsTransition(
      state,
      {
        id: 'v1',
        tick: 2,
        type: 'TXN_2PC_PARTICIPANT_VOTE',
        payload: { participantId: 'part-order-svc', vote: 'VOTE_COMMIT' },
      },
      rng,
    ).nextState;
    state = pureTransactionsTransition(
      state,
      {
        id: 'v2',
        tick: 2,
        type: 'TXN_2PC_PARTICIPANT_VOTE',
        payload: { participantId: 'part-payment-svc', vote: 'VOTE_COMMIT' },
      },
      rng,
    ).nextState;

    // Coordinator crashes BEFORE broadcasting final commit decision
    state = pureTransactionsTransition(
      state,
      {
        id: 'crash-coord',
        tick: 3,
        type: 'TXN_2PC_CRASH_COORDINATOR',
        payload: { crashTiming: 'AFTER_PREPARE' },
      },
      rng,
    ).nextState;

    // Participants that voted commit are frozen in BLOCKED_UNCERTAIN
    expect(state.twoPhaseCommit.finalOutcome).toBe('BLOCKED_UNCERTAIN');
    expect(state.twoPhaseCommit.participants['part-order-svc']?.state).toBe('BLOCKED_UNCERTAIN');
    expect(state.twoPhaseCommit.participants['part-payment-svc']?.state).toBe('BLOCKED_UNCERTAIN');

    // Demonstrates TXN-2 blocking hazard
    const v = checker.check(state);
    expect(v?.ruleId).toBe('TXN-2');
    expect(v?.isPedagogicalFlaw).toBe(true);
  });

  it('TXN-3 & TXN-4: Enforces strict reverse-order Saga compensation upon failure', () => {
    let state = createDefaultTransactionsCluster();

    // Start Saga
    state = pureTransactionsTransition(
      state,
      { id: 'saga-start', tick: 1, type: 'TXN_SAGA_START', payload: { sagaId: 'checkout-saga-1' } },
      rng,
    ).nextState;

    // Step 0 succeeds (Order created)
    state = pureTransactionsTransition(
      state,
      {
        id: 'step-0',
        tick: 2,
        type: 'TXN_SAGA_STEP_OUTCOME',
        payload: { stepIndex: 0, success: true },
      },
      rng,
    ).nextState;
    expect(state.saga.forwardCompletedOrder).toEqual(['step-1-order']);

    // Step 1 succeeds (Inventory reserved)
    state = pureTransactionsTransition(
      state,
      {
        id: 'step-1',
        tick: 3,
        type: 'TXN_SAGA_STEP_OUTCOME',
        payload: { stepIndex: 1, success: true },
      },
      rng,
    ).nextState;
    expect(state.saga.forwardCompletedOrder).toEqual(['step-1-order', 'step-2-inventory']);

    // Step 2 fails (Payment declined!)
    state = pureTransactionsTransition(
      state,
      {
        id: 'step-2-fail',
        tick: 4,
        type: 'TXN_SAGA_STEP_OUTCOME',
        payload: { stepIndex: 2, success: false },
      },
      rng,
    ).nextState;

    // Status is COMPENSATED
    expect(state.saga.status).toBe('COMPENSATED');

    // Compensations executed in strict reverse order (LIFO): step 2 compensation then step 1 compensation!
    expect(state.saga.compensationExecutedOrder).toEqual(['step-2-inventory', 'step-1-order']);

    const v = checker.check(state);
    expect(v).toBeUndefined();
  });
});
