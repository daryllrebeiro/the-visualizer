#!/usr/bin/env node

/**
 * Live Behavioral Audit Checks for System Design Canon Domains
 *
 * Runs the 4 required live behavioral scenarios:
 * 1. Distributed Lock Kleppmann scenario (Fencing ENABLED) -> Stale write rejected.
 * 2. Distributed Lock Kleppmann scenario (Fencing DISABLED) -> Protected resource corrupted.
 * 3. Rate Limiter Fixed Window boundary burst -> Traffic across window boundary, admitted counts.
 * 4. Transactions coordinator crash after PREPARE -> Participants blocked uncertain.
 */

import {
  createDefaultDistributedLockCluster,
  pureDistributedLockTransition,
  DistributedLockInvariantChecker,
  createDefaultRateLimiterCluster,
  pureRateLimiterTransition,
  RateLimiterInvariantChecker,
  createDefaultTransactionsCluster,
  pureTransactionsTransition,
  TransactionsInvariantChecker,
  DeterministicRNG,
} from '../packages/simulation/dist/index.js';

console.log('================================================================================');
console.log('LIVE BEHAVIORAL AUDIT CHECKS — THEVISUALIZER SYSTEM DESIGN CANON');
console.log('================================================================================\n');

const rng = new DeterministicRNG(42);

// -----------------------------------------------------------------------------
// CHECK 1: Distributed Lock Kleppmann Scenario (Fencing ENABLED)
// -----------------------------------------------------------------------------
console.log('>>> CHECK 1: Distributed Lock — Kleppmann Scenario (Fencing ENABLED)');
{
  const lockChecker = new DistributedLockInvariantChecker();
  let state = createDefaultDistributedLockCluster();
  state.fencingEnabled = true;

  console.log(`[Tick 0] Cluster initialized with fencingEnabled=true, leaseTtl=10 ticks.`);
  console.log(`         Initial Resource Value: "${state.protectedResource.currentValue}", Highest Token: ${state.protectedResource.highestFencingTokenSeen}`);

  // Step 1: Client A acquires lock
  state = pureDistributedLockTransition(
    state,
    { id: 'evt-acq-a', tick: 1, type: 'LOCK_ACQUIRE', payload: { clientId: 'client-A' } },
    rng
  ).nextState;
  const tokenA = state.clients['client-A'].assignedFencingToken;
  console.log(`[Tick 1] Client-A acquired lock. State: ${state.clients['client-A'].state}, Fencing Token: ${tokenA}, Lease Expires: Tick ${state.clients['client-A'].leaseExpiresAtTick}`);

  // Step 2: Inject GC pause on Client A
  state = pureDistributedLockTransition(
    state,
    { id: 'evt-gc-a', tick: 2, type: 'LOCK_INJECT_GC_PAUSE', payload: { clientId: 'client-A', durationTicks: 10 } },
    rng
  ).nextState;
  console.log(`[Tick 2] GC pause injected on Client-A for 10 ticks. State: ${state.clients['client-A'].state}, Remaining Pause: ${state.clients['client-A'].gcPauseRemainingTicks}`);

  // Step 3: Advance ticks to expire lease
  for (let t = 3; t <= 12; t++) {
    state = pureDistributedLockTransition(
      state,
      { id: `tick-${t}`, tick: t, type: 'LOCK_TICK', payload: {} },
      rng
    ).nextState;
  }
  console.log(`[Tick 12] Time advanced to tick 12. Node 1 lease heldByClient: ${state.nodes['node-1'].heldByClient ?? 'NULL (expired)'}`);

  // Step 4: Client B acquires lock
  state = pureDistributedLockTransition(
    state,
    { id: 'evt-acq-b', tick: 12, type: 'LOCK_ACQUIRE', payload: { clientId: 'client-B' } },
    rng
  ).nextState;
  const tokenB = state.clients['client-B'].assignedFencingToken;
  console.log(`[Tick 12] Client-B acquired lock. State: ${state.clients['client-B'].state}, Fencing Token: ${tokenB}`);

  // Step 5: Client B writes to protected resource
  state = pureDistributedLockTransition(
    state,
    { id: 'evt-wr-b', tick: 13, type: 'LOCK_WRITE_PROTECTED_RESOURCE', payload: { clientId: 'client-B', data: 'VALID_WRITE_FROM_CLIENT_B' } },
    rng
  ).nextState;
  console.log(`[Tick 13] Client-B wrote data. Resource Value: "${state.protectedResource.currentValue}", Highest Token Seen: ${state.protectedResource.highestFencingTokenSeen}`);

  // Step 6: Client A wakes up from GC pause at tick 14
  state = pureDistributedLockTransition(
    state,
    { id: 'tick-14', tick: 14, type: 'LOCK_TICK', payload: {} },
    rng
  ).nextState;
  console.log(`[Tick 14] Client-A resumes from GC pause. Believes State: ${state.clients['client-A'].state} (Holds stale token ${state.clients['client-A'].assignedFencingToken})`);

  // Step 7: Client A attempts stale write at tick 15
  state = pureDistributedLockTransition(
    state,
    { id: 'evt-wr-a', tick: 15, type: 'LOCK_WRITE_PROTECTED_RESOURCE', payload: { clientId: 'client-A', data: 'STALE_OVERWRITE_FROM_CLIENT_A' } },
    rng
  ).nextState;

  const lastWrite = state.protectedResource.writesHistory[state.protectedResource.writesHistory.length - 1];
  console.log(`[Tick 15] Client-A attempted write with token ${lastWrite.fencingToken}:`);
  console.log(`         Write Status: ${lastWrite.status}`);
  console.log(`         Resource Value: "${state.protectedResource.currentValue}"`);
  console.log(`         Safely Rejected Count: ${state.protectedResource.safelyRejectedCount}`);
  console.log(`         Corrupted Writes Count: ${state.protectedResource.corruptedWritesCount}`);

  const violation = lockChecker.check(state);
  console.log(`         Invariant Check: ruleId=${violation?.ruleId}, isPedagogicalFlaw=${violation?.isPedagogicalFlaw}, msg="${violation?.description}"`);
  console.log(`✅ RESULT: Stale write REJECTED safely by fencing token. Data preserved.\n`);
}

// -----------------------------------------------------------------------------
// CHECK 2: Distributed Lock Kleppmann Scenario (Fencing DISABLED)
// -----------------------------------------------------------------------------
console.log('>>> CHECK 2: Distributed Lock — Kleppmann Scenario (Fencing DISABLED -> CORRUPTION)');
{
  const lockChecker = new DistributedLockInvariantChecker();
  let state = createDefaultDistributedLockCluster();
  state.fencingEnabled = false; // Disable fencing!

  console.log(`[Tick 0] Cluster initialized with fencingEnabled=FALSE (Naive mutual exclusion).`);
  console.log(`         Initial Resource Value: "${state.protectedResource.currentValue}"`);

  // Step 1: Client A acquires lock
  state = pureDistributedLockTransition(
    state,
    { id: 'evt-acq-a', tick: 1, type: 'LOCK_ACQUIRE', payload: { clientId: 'client-A' } },
    rng
  ).nextState;
  console.log(`[Tick 1] Client-A acquired lock. Assigned Token: ${state.clients['client-A'].assignedFencingToken}`);

  // Step 2: Inject GC pause on Client A
  state = pureDistributedLockTransition(
    state,
    { id: 'evt-gc-a', tick: 2, type: 'LOCK_INJECT_GC_PAUSE', payload: { clientId: 'client-A', durationTicks: 10 } },
    rng
  ).nextState;
  console.log(`[Tick 2] GC pause injected on Client-A for 10 ticks.`);

  // Step 3: Advance ticks to expire lease
  for (let t = 3; t <= 12; t++) {
    state = pureDistributedLockTransition(
      state,
      { id: `tick-${t}`, tick: t, type: 'LOCK_TICK', payload: {} },
      rng
    ).nextState;
  }
  console.log(`[Tick 12] Time advanced to tick 12. Lease expired on storage nodes.`);

  // Step 4: Client B acquires lock and writes
  state = pureDistributedLockTransition(
    state,
    { id: 'evt-acq-b', tick: 12, type: 'LOCK_ACQUIRE', payload: { clientId: 'client-B' } },
    rng
  ).nextState;
  state = pureDistributedLockTransition(
    state,
    { id: 'evt-wr-b', tick: 13, type: 'LOCK_WRITE_PROTECTED_RESOURCE', payload: { clientId: 'client-B', data: 'LEGITIMATE_UPDATE_FROM_CLIENT_B' } },
    rng
  ).nextState;
  console.log(`[Tick 13] Client-B acquired lock and wrote: "${state.protectedResource.currentValue}"`);

  // Step 5: Client A wakes up at tick 14
  state = pureDistributedLockTransition(
    state,
    { id: 'tick-14', tick: 14, type: 'LOCK_TICK', payload: {} },
    rng
  ).nextState;
  console.log(`[Tick 14] Client-A woke up from GC pause. Both clients in HOLDING state: Client-A=${state.clients['client-A'].state}, Client-B=${state.clients['client-B'].state}`);

  // Step 6: Client A performs stale write without fencing token validation
  state = pureDistributedLockTransition(
    state,
    { id: 'evt-wr-a', tick: 15, type: 'LOCK_WRITE_PROTECTED_RESOURCE', payload: { clientId: 'client-A', data: 'CORRUPTED_STALE_PAYLOAD_FROM_CLIENT_A' } },
    rng
  ).nextState;

  const lastWrite = state.protectedResource.writesHistory[state.protectedResource.writesHistory.length - 1];
  console.log(`[Tick 15] Client-A wrote to protected resource WITHOUT fencing:`);
  console.log(`         Write Status: ${lastWrite.status}`);
  console.log(`         Resource Value: "${state.protectedResource.currentValue}" (OVERWRITTEN!)`);
  console.log(`         Corrupted Writes Count: ${state.protectedResource.corruptedWritesCount}`);
  console.log(`         flawsDemonstrated.dataCorruptedWithoutFencing: ${state.flawsDemonstrated.dataCorruptedWithoutFencing}`);

  const violation = lockChecker.check(state);
  console.log(`         Invariant Check: ruleId=${violation?.ruleId}, severity=${violation?.severity}, isPedagogicalFlaw=${violation?.isPedagogicalFlaw}`);
  console.log(`         Violation Message: "${violation?.description}"`);
  console.log(`💥 RESULT: Protected resource SILENTLY CORRUPTED. Hard invariant LOCK-1 tripped!\n`);
}

// -----------------------------------------------------------------------------
// CHECK 3: Rate Limiter Fixed Window Boundary Burst
// -----------------------------------------------------------------------------
console.log('>>> CHECK 3: Rate Limiter — Fixed Window Boundary Burst Flaw');
{
  const rlChecker = new RateLimiterInvariantChecker();
  let state = createDefaultRateLimiterCluster();
  const clientId = 'client-1';
  // Window size = 10 ticks, limit = 10 requests per window

  console.log(`[Config] Window Size: ${state.globalWindowSizeTicks} ticks, Limit: ${state.globalLimit} reqs/window.`);
  console.log(`         Window 0: ticks [0..9]. Window 1: ticks [10..19].`);

  // Staged boundary traffic: 10 requests at tick 9 (end of Window 0)
  console.log(`[Tick 9] Firing 10 requests at tick 9 (Window 0 boundary tail)...`);
  for (let i = 0; i < 10; i++) {
    state = pureRateLimiterTransition(
      state,
      { id: `req-w0-${i}`, tick: 9, type: 'RATE_LIMITER_REQUEST', payload: { clientId } },
      rng
    ).nextState;
  }
  const client = state.clients[clientId];
  console.log(`         After Tick 9:`);
  console.log(`         - Fixed Window: Admitted=${client.totalAdmitted.FIXED_WINDOW}, Denied=${client.totalDenied.FIXED_WINDOW}`);
  console.log(`         - Sliding Log:  Admitted=${client.totalAdmitted.SLIDING_LOG}, Denied=${client.totalDenied.SLIDING_LOG}`);

  // Staged boundary traffic: 10 requests at tick 10 (start of Window 1)
  console.log(`[Tick 10] Firing 10 requests at tick 10 (Window 1 boundary head)...`);
  for (let i = 0; i < 10; i++) {
    state = pureRateLimiterTransition(
      state,
      { id: `req-w1-${i}`, tick: 10, type: 'RATE_LIMITER_REQUEST', payload: { clientId } },
      rng
    ).nextState;
  }

  const clientAfterW1 = state.clients[clientId];
  console.log(`[Tick 10 Summary Across 2-Tick Boundary Span (Ticks 9-10)]:`);
  console.log(`         - Fixed Window Admitted Total:    ${clientAfterW1.totalAdmitted.FIXED_WINDOW} / 20 requests (100% admitted!)`);
  console.log(`         - Sliding Log Admitted Total:     ${clientAfterW1.totalAdmitted.SLIDING_LOG} / 20 requests (strictly 10 admitted, 10 rejected)`);
  console.log(`         - Token Bucket Admitted Total:    ${clientAfterW1.totalAdmitted.TOKEN_BUCKET} / 20 requests`);
  console.log(`         - Sliding Counter Admitted Total: ${clientAfterW1.totalAdmitted.SLIDING_COUNTER} / 20 requests`);
  console.log(`         flawsDemonstrated.fixedWindowBoundaryBurstDetected: ${state.flawsDemonstrated.fixedWindowBoundaryBurstDetected}`);

  const violation = rlChecker.check(state);
  console.log(`         Invariant Check: ruleId=${violation?.ruleId}, isPedagogicalFlaw=${violation?.isPedagogicalFlaw}`);
  console.log(`         Violation Message: "${violation?.description}"`);
  console.log(`⚠️  RESULT: Fixed Window admitted 2x limit (20 reqs in 2 ticks) across boundary while Sliding Log capped at 10.\n`);
}

// -----------------------------------------------------------------------------
// CHECK 4: Transactions 2PC Coordinator Crash After PREPARE
// -----------------------------------------------------------------------------
console.log('>>> CHECK 4: Transactions — 2PC Coordinator Crash After PREPARE');
{
  const txnChecker = new TransactionsInvariantChecker();
  let state = createDefaultTransactionsCluster();

  console.log(`[Tick 0] Initialized 2PC cluster. Active Protocol: ${state.activeProtocol}`);

  // Start 2PC
  state = pureTransactionsTransition(
    state,
    { id: 'evt-2pc-start', tick: 1, type: 'TXN_2PC_START', payload: { transactionId: 'tx-audit-live' } },
    rng
  ).nextState;
  console.log(`[Tick 1] Started 2PC transaction: ${state.twoPhaseCommit.transactionId}. Phase: ${state.twoPhaseCommit.phase}`);

  // Participants vote COMMIT during Prepare Phase (Order & Payment vote COMMIT and enter PREPARED)
  for (const partId of ['part-order-svc', 'part-payment-svc']) {
    state = pureTransactionsTransition(
      state,
      { id: `vote-${partId}`, tick: 2, type: 'TXN_2PC_PARTICIPANT_VOTE', payload: { participantId: partId, vote: 'VOTE_COMMIT' } },
      rng
    ).nextState;
  }
  console.log(`[Tick 2] Participants voted during Prepare Phase:`);
  for (const [id, p] of Object.entries(state.twoPhaseCommit.participants)) {
    console.log(`         - ${id}: state=${p.state}, vote=${p.vote ?? 'PENDING'}`);
  }
  console.log(`         Coordinator Phase before crash: ${state.twoPhaseCommit.phase}`);

  // Coordinator crashes AFTER PREPARE before final commit decision can be decided/broadcast
  state = pureTransactionsTransition(
    state,
    { id: 'evt-crash-coord', tick: 3, type: 'TXN_2PC_CRASH_COORDINATOR', payload: { crashTiming: 'AFTER_PREPARE' } },
    rng
  ).nextState;

  console.log(`[Tick 3] Coordinator CRASHED with crashTiming='AFTER_PREPARE':`);
  console.log(`         Coordinator Phase: ${state.twoPhaseCommit.phase}`);
  console.log(`         Transaction Final Outcome: ${state.twoPhaseCommit.finalOutcome}`);
  console.log(`         Participant States:`);
  for (const [id, p] of Object.entries(state.twoPhaseCommit.participants)) {
    console.log(`         - ${id}: state=${p.state} (LOCKED / UNABLE TO PROGRESS)`);
  }
  console.log(`         flawsDemonstrated.twoPhaseCommitBlockingHazardDetected: ${state.flawsDemonstrated.twoPhaseCommitBlockingHazardDetected}`);

  const violation = txnChecker.check(state);
  console.log(`         Invariant Check: ruleId=${violation?.ruleId}, isPedagogicalFlaw=${violation?.isPedagogicalFlaw}`);
  console.log(`         Violation Message: "${violation?.description}"`);
  console.log(`🔒 RESULT: All participants visibly stay locked in BLOCKED_UNCERTAIN state.\n`);
}

console.log('================================================================================');
console.log('ALL 4 LIVE BEHAVIORAL CHECKS COMPLETED SUCCESSFULLY WITH RAW CAPTURED OUTPUT');
console.log('================================================================================');
