import { DeterministicRNG } from '../packages/simulation/dist/prng/deterministic-rng.js';
import { createDefaultRaftCluster, pureRaftTransition } from '../packages/simulation/dist/domains/raft/raft-state-transitions.js';
import { getClusterSlot, extractHashTag, crc16 } from '../packages/simulation/dist/domains/redis/crc16.js';
import { generateBloomFilter, testBloomFilter, calculateTheoreticalBloomFpRate } from '../packages/simulation/dist/domains/storage/lsm-tree.js';
import { createDefaultCdnCacheCluster, pureCdnCacheTransition } from '../packages/simulation/dist/domains/cdn-cache/cdn-cache-state-transitions.js';
import { createDefaultIdGenCluster, pureIdGenTransition } from '../packages/simulation/dist/domains/id-gen/id-gen-state-transitions.js';
import { generateSnowflakeBigInt, decomposeSnowflake } from '../packages/simulation/dist/domains/id-gen/snowflake-generator.js';
import { createDefaultDistributedLockCluster, pureDistributedLockTransition } from '../packages/simulation/dist/domains/distributed-lock/distributed-lock-state-transitions.js';

const timestamp = new Date().toISOString();
console.log(`=== ADVERSARIAL REPRODUCTION OF PART A DATA [${timestamp}] ===\n`);

// 1. RAFT ELECTION TIMEOUT TEST
console.log('--- ITEM 1: RAFT ELECTION TIMEOUTS ---');
const testRaftSeed = (seed) => {
  const cluster = createDefaultRaftCluster('c', 5, seed);
  const rng = new DeterministicRNG(seed);
  let firstTimeoutTick = -1;
  let state = cluster;
  for (let tick = 1; tick <= 500; tick++) {
    const res = pureRaftTransition(state, { id: `t-${tick}`, tick, type: 'RAFT_TICK', payload: {} }, rng);
    state = res.nextState;
    if (res.emittedEvents.some((e) => e.type === 'RAFT_ELECTION_TIMEOUT')) {
      firstTimeoutTick = tick;
      break;
    }
  }
  return {
    initialCountdowns: Object.fromEntries(Object.entries(cluster.nodes).map(([id, n]) => [id, n.currentElectionCountdown])),
    firstTimeoutTick,
  };
};

for (const seed of [42, 99, 101, 202, 303, 777, 888]) {
  const res = testRaftSeed(seed);
  console.log(`Seed ${seed}: Initial countdowns = ${JSON.stringify(res.initialCountdowns)}, First timeout tick = ${res.firstTimeoutTick}`);
}

// 2. REDIS HASH SLOTS
console.log('\n--- ITEM 2: REDIS CLUSTER CRC16 HASH SLOTS ---');
const keys = ['{user1}.profile', '{user1}.settings', '{user:42}:profile', '{user:42}:orders', 'alpha', 'beta'];
for (const k of keys) {
  const tag = extractHashTag(k);
  const c = crc16(tag);
  const slot = getClusterSlot(k);
  console.log(`Key '${k}': tag='${tag}', CRC16=${c}, slot=${slot}`);
}

// 3. STORAGE BLOOM FILTER
console.log('\n--- ITEM 3: BLOOM FILTER MATH AND EMPIRICAL FP RATE ---');
const theoretical = calculateTheoreticalBloomFpRate(2000, 5, 150);
console.log(`Theoretical FP rate (m=2000, k=5, n=150): ${theoretical} (${(theoretical * 100).toFixed(4)}%)`);

const insertedKeys = Array.from({ length: 150 }, (_, i) => i + 1);
const { bitset, bits, k } = generateBloomFilter(insertedKeys, 2000 / 150, 5);
console.log(`Filter bit count: ${bits}, hash count: ${k}`);

// Disclosed sequence vs distinct sequence
const ranges = [
  { name: 'Sequential 10001..20000', start: 10001, end: 20000 },
  { name: 'Sequential 20001..30000', start: 20001, end: 30000 },
  { name: 'Sequential 30001..40000', start: 30001, end: 40000 },
];
for (const r of ranges) {
  let fps = 0;
  for (let key = r.start; key <= r.end; key++) {
    if (testBloomFilter(bitset, key, 5)) fps++;
  }
  console.log(`${r.name}: ${fps} / 10000 false positives (${(fps / 100).toFixed(2)}%)`);
}

// 4. CDN SINGLE-FLIGHT AND TIERED OFFLOAD
console.log('\n--- ITEM 4: CDN CACHE REAL TESTS ---');
const cdnRng = new DeterministicRNG(42);
let cdnState = createDefaultCdnCacheCluster();
cdnState = pureCdnCacheTransition(
  cdnState,
  { id: 'f1', tick: 1, type: 'CDN_FLASH_CROWD', payload: { key: '/app.js', requestCount: 20 } },
  cdnRng
).nextState;
console.log(`CDN Single-Flight 20 requests: origin requests received = ${cdnState.origin.totalRequestsReceived}`);

let tieredState = createDefaultCdnCacheCluster();
tieredState = pureCdnCacheTransition(
  tieredState,
  { id: 'r1', tick: 1, type: 'CDN_REQUEST', payload: { key: '/app.js', clientRegion: 'US_EAST' } },
  cdnRng
).nextState;
tieredState = pureCdnCacheTransition(
  tieredState,
  { id: 'r2', tick: 2, type: 'CDN_REQUEST', payload: { key: '/app.js', clientRegion: 'US_WEST' } },
  cdnRng
).nextState;
console.log(`CDN Tiered Regional Offload (2 requests US_EAST then US_WEST): origin requests = ${tieredState.origin.totalRequestsReceived}, regional hits = ${tieredState.regionalTiers['reg-us']?.totalHits}`);

// 5. ID GENERATOR REAL TESTS
console.log('\n--- ITEM 5: ID GENERATOR ACTUAL TESTS ---');
const idRng = new DeterministicRNG(42);
let idState = createDefaultIdGenCluster();
for (let w = 1; w <= 4; w++) {
  for (let i = 0; i < 20; i++) {
    idState = pureIdGenTransition(idState, { id: `g-${w}-${i}`, tick: i, type: 'ID_GEN_GENERATE', payload: { workerId: w } }, idRng).nextState;
  }
}
console.log(`Fidelity test generated IDs count: ${idState.generatedIds.length}, unique count: ${new Set(idState.generatedIds.map(r => r.id)).size}`);

// What if we generate 100,000 raw Snowflake IDs in memory?
const rawSnowflakes = new Set();
let collisions = 0;
for (let w = 0; w < 8; w++) {
  for (let i = 0; i < 12500; i++) {
    const id = generateSnowflakeBigInt(i, w, i % 4096);
    if (rawSnowflakes.has(id)) collisions++;
    rawSnowflakes.add(id);
  }
}
console.log(`Synthetic 100,000 Snowflake generation: size=${rawSnowflakes.size}, collisions=${collisions}`);

// 6. DISTRIBUTED LOCK REAL TESTS
console.log('\n--- ITEM 6: DISTRIBUTED LOCK KLEPPMANN SIMULATION ---');
const lockRng = new DeterministicRNG(42);
let lockState = createDefaultDistributedLockCluster();
lockState = pureDistributedLockTransition(lockState, { id: 'a1', tick: 1, type: 'LOCK_ACQUIRE', payload: { clientId: 'client-A' } }, lockRng).nextState;
lockState = pureDistributedLockTransition(lockState, { id: 'gc', tick: 2, type: 'LOCK_INJECT_GC_PAUSE', payload: { clientId: 'client-A', durationTicks: 10 } }, lockRng).nextState;
for (let t = 3; t <= 12; t++) {
  lockState = pureDistributedLockTransition(lockState, { id: `t-${t}`, tick: t, type: 'LOCK_TICK', payload: {} }, lockRng).nextState;
}
lockState = pureDistributedLockTransition(lockState, { id: 'b1', tick: 12, type: 'LOCK_ACQUIRE', payload: { clientId: 'client-B' } }, lockRng).nextState;
lockState = pureDistributedLockTransition(lockState, { id: 'bw', tick: 13, type: 'LOCK_WRITE_PROTECTED_RESOURCE', payload: { clientId: 'client-B', data: 'WRITE_FROM_B' } }, lockRng).nextState;
lockState = pureDistributedLockTransition(lockState, { id: 't14', tick: 14, type: 'LOCK_TICK', payload: {} }, lockRng).nextState;
lockState = pureDistributedLockTransition(lockState, { id: 'aw', tick: 15, type: 'LOCK_WRITE_PROTECTED_RESOURCE', payload: { clientId: 'client-A', data: 'STALE_WRITE_FROM_A' } }, lockRng).nextState;
console.log(`Kleppmann simulation with fencing: currentValue='${lockState.protectedResource.currentValue}', safelyRejectedCount=${lockState.protectedResource.safelyRejectedCount}`);
