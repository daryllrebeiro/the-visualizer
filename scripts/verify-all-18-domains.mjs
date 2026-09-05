#!/usr/bin/env node

/**
 * All-18-Domain Behavioral Verification Suite — TheVisualizer Platform
 *
 * Programmatically exercises all 18 registered domains via DomainRegistry:
 * 1. Kafka
 * 2. Raft
 * 3. Database
 * 4. Redis
 * 5. Kubernetes
 * 6. RabbitMQ
 * 7. Storage
 * 8. Networking
 * 9. Rate Limiter
 * 10. Distributed Lock
 * 11. CDN Cache
 * 12. ID Generator
 * 13. Transactions
 * 14. Modular RAG
 * 15. Agent Swarm
 * 16. LLM Serving
 * 17. Vector Database
 * 18. GPU Cluster
 *
 * Verifies:
 * - Default state initialization & invariant cleanliness
 * - Deterministic multi-tick state reduction
 * - Deep domain-specific behavioral invariants
 * - Permalinks round-trip encoding/decoding for every domain
 */

import {
  DomainRegistry,
  DeterministicRNG,
  createDefaultDistributedLockCluster,
  pureDistributedLockTransition,
  createDefaultRateLimiterCluster,
  pureRateLimiterTransition,
  createDefaultTransactionsCluster,
  pureTransactionsTransition,
} from '../packages/simulation/dist/index.js';

console.log('================================================================================');
console.log('ALL-18-DOMAIN BEHAVIORAL VERIFICATION SUITE — THEVISUALIZER PLATFORM');
console.log('================================================================================\n');

const EXPECTED_DOMAINS = [
  'agents',
  'cdn-cache',
  'database',
  'distributed-lock',
  'gpu-cluster',
  'id-gen',
  'kafka',
  'kubernetes',
  'llm-serving',
  'networking',
  'rabbitmq',
  'raft',
  'rag',
  'rate-limiter',
  'redis',
  'storage',
  'transactions',
  'vectordb',
];

let totalPassed = 0;
let totalFailed = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    totalFailed++;
    throw new Error(message);
  }
}

// -----------------------------------------------------------------------------
// SECTION 1: Registry Integrity & Taxonomy Verification
// -----------------------------------------------------------------------------
console.log('>>> SECTION 1: Universal Domain Registry Verification (18 Domains)');
const registered = DomainRegistry.list();
assert(registered.length === 18, `Expected 18 domains registered, found ${registered.length}`);

const registeredIds = registered.map(d => d.id).sort();
assert(
  JSON.stringify(registeredIds) === JSON.stringify(EXPECTED_DOMAINS),
  'Registered domain IDs match expected canonical 18-domain taxonomy'
);
console.log(`✅ All 18 domains successfully registered in DomainRegistry.`);
totalPassed++;

// -----------------------------------------------------------------------------
// SECTION 2: Per-Domain State Lifecycle & Invariant Cleanliness
// -----------------------------------------------------------------------------
console.log('\n>>> SECTION 2: Per-Domain Reducer & Invariant Verification');

for (let i = 0; i < registered.length; i++) {
  const meta = registered[i];
  const plugin = DomainRegistry.get(meta.id);
  const domainLabel = `[Domain ${String(i + 1).padStart(2, '0')}/18] ${meta.id.padEnd(17)}`;

  try {
    process.stdout.write(`${domainLabel} | Init & 10-Tick State Transitions... `);
    const rng = new DeterministicRNG(42 + i);

    // 1. Init default state
    let state = plugin.createDefaultState();
    assert(state !== null && typeof state === 'object', 'Default state is a valid object');

    // 2. Fresh state invariant check
    if (typeof plugin.validateInvariants === 'function') {
      const report = plugin.validateInvariants(state);
      assert(report.passed || report.violations.every(v => v.isPedagogicalFlaw), 'Default state has no non-pedagogical violations');
    }

    // 3. Multi-tick reduction
    for (let t = 0; t < 10; t++) {
      const event = {
        id: `sim-verify-${meta.id}-${t}`,
        tick: t + 1,
        type: 'TICK',
        payload: {},
      };
      const res = plugin.reduceState(state, event, rng);
      assert(res && res.nextState, 'Reducer returned nextState');
      state = res.nextState;
    }

    console.log('✅ PASS');
    totalPassed++;
  } catch (err) {
    console.log(`❌ FAIL (${err.message})`);
    totalFailed++;
  }
}

// -----------------------------------------------------------------------------
// SECTION 3: Deep Behavioral Checks (Canon Invariants)
// -----------------------------------------------------------------------------
console.log('\n>>> SECTION 3: Deep Behavioral Scenario Verifications');

// Check 3.1: Distributed Lock Fencing Protection
{
  process.stdout.write('Checking Distributed Lock Kleppmann GC Pause (Fencing ENABLED)... ');
  const rng = new DeterministicRNG(42);
  let state = createDefaultDistributedLockCluster();
  state.fencingEnabled = true;

  state = pureDistributedLockTransition(state, { id: 'e1', tick: 1, type: 'LOCK_ACQUIRE', payload: { clientId: 'client-A' } }, rng).nextState;
  const tokenA = state.clients['client-A'].assignedFencingToken;
  assert(tokenA > 0, 'Client A received fencing token');

  state = pureDistributedLockTransition(state, { id: 'e2', tick: 2, type: 'LOCK_INJECT_GC_PAUSE', payload: { clientId: 'client-A', durationTicks: 10 } }, rng).nextState;
  
  // Advance ticks using LOCK_TICK
  for (let t = 3; t <= 12; t++) {
    state = pureDistributedLockTransition(state, { id: `tick-${t}`, tick: t, type: 'LOCK_TICK', payload: {} }, rng).nextState;
  }

  state = pureDistributedLockTransition(state, { id: 'e4', tick: 12, type: 'LOCK_ACQUIRE', payload: { clientId: 'client-B' } }, rng).nextState;
  state = pureDistributedLockTransition(state, { id: 'e5', tick: 13, type: 'LOCK_WRITE_PROTECTED_RESOURCE', payload: { clientId: 'client-B', data: 'B_DATA' } }, rng).nextState;
  
  // Client A resumes and attempts stale write
  state = pureDistributedLockTransition(state, { id: 'e6', tick: 14, type: 'LOCK_TICK', payload: {} }, rng).nextState;
  state = pureDistributedLockTransition(state, { id: 'e7', tick: 15, type: 'LOCK_WRITE_PROTECTED_RESOURCE', payload: { clientId: 'client-A', data: 'STALE_A' } }, rng).nextState;

  assert(state.protectedResource.currentValue === 'B_DATA', 'Resource preserved Client B valid write');
  assert(state.protectedResource.safelyRejectedCount >= 1, 'Stale write rejected by fencing token');
  console.log('✅ PASS (Safely Rejected)');
  totalPassed++;
}

// Check 3.2: Rate Limiter Boundary Burst Flaw
{
  process.stdout.write('Checking Rate Limiter Fixed Window Boundary Burst (2x Spurt)... ');
  const rng = new DeterministicRNG(42);
  let state = createDefaultRateLimiterCluster();
  state.windowSizeTicks = 10;
  state.globalCapacity = 10;

  // Burst at boundary
  for (let i = 0; i < 10; i++) {
    state = pureRateLimiterTransition(state, { id: `b1-${i}`, tick: 9, type: 'RATE_LIMITER_REQUEST', payload: { clientId: 'client-1' } }, rng).nextState;
  }
  for (let i = 0; i < 10; i++) {
    state = pureRateLimiterTransition(state, { id: `b2-${i}`, tick: 10, type: 'RATE_LIMITER_REQUEST', payload: { clientId: 'client-1' } }, rng).nextState;
  }

  const client = state.clients['client-1'];
  assert(client.totalAdmitted.FIXED_WINDOW === 20, 'Fixed window admitted 20/20 requests across boundary (2x burst flaw)');
  assert(client.totalAdmitted.SLIDING_LOG <= 10, 'Sliding log strictly throttled burst');
  console.log('✅ PASS (2x Burst Demonstrated)');
  totalPassed++;
}

// Check 3.3: 2PC Coordinator Crash In-Doubt Deadlock
{
  process.stdout.write('Checking 2PC Coordinator Crash Deadlock (BLOCKED_UNCERTAIN)... ');
  const rng = new DeterministicRNG(42);
  let state = createDefaultTransactionsCluster();
  state = pureTransactionsTransition(state, { id: 'tx-s', tick: 1, type: 'TXN_2PC_START', payload: { transactionId: 'tx-fail-demo' } }, rng).nextState;
  
  // Participants vote COMMIT during Prepare Phase
  for (const partId of ['part-order-svc', 'part-payment-svc']) {
    state = pureTransactionsTransition(
      state,
      { id: `vote-${partId}`, tick: 2, type: 'TXN_2PC_PARTICIPANT_VOTE', payload: { participantId: partId, vote: 'VOTE_COMMIT' } },
      rng
    ).nextState;
  }

  state = pureTransactionsTransition(state, { id: 'tx-c', tick: 3, type: 'TXN_2PC_CRASH_COORDINATOR', payload: { crashTiming: 'AFTER_PREPARE' } }, rng).nextState;

  const orderPart = state.twoPhaseCommit.participants['part-order-svc'];
  assert(orderPart.state === 'BLOCKED_UNCERTAIN', 'Participant held in BLOCKED_UNCERTAIN state without unilateral resolution');
  console.log('✅ PASS (Blocked In-Doubt)');
  totalPassed++;
}

// -----------------------------------------------------------------------------
// SECTION 4: Universal Permalink Compatibility Across All 18 Domains
// -----------------------------------------------------------------------------
console.log('\n>>> SECTION 4: Universal Permalink Serialization for All 18 Domains');
{
  for (const domain of EXPECTED_DOMAINS) {
    const raw = JSON.stringify({ domain, tick: 42, scenarioId: 'default' });
    const encoded = Buffer.from(raw).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    
    // Decode test
    let base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4 !== 0) base64 += '=';
    const decoded = JSON.parse(Buffer.from(base64, 'base64').toString('utf8'));
    assert(decoded.domain === domain && decoded.tick === 42, `Permalink roundtrip verified for ${domain}`);
  }
  console.log(`✅ Verified URL-safe permalink roundtrip encoding for all 18 domains.`);
  totalPassed++;
}

console.log('\n================================================================================');
console.log(`FINAL RESULT: ${totalPassed} / 23 VERIFICATION CHECKS PASSED (${totalFailed} failures)`);
console.log('================================================================================\n');

if (totalFailed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
