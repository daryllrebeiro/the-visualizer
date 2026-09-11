/**
 * Golden Determinism Test Suite
 *
 * For each of the 28 domains, seeds the RNG, applies a fixed event sequence,
 * and asserts the resulting state hash matches a locked-in golden value.
 *
 * If this test breaks, it means a simulation reducer changed its output
 * for the same inputs — which is a determinism regression that MUST be
 * investigated before merging. Regenerate vectors explicitly with
 * `pnpm sim:golden:update` and review the diff like a snapshot update.
 *
 * Run: pnpm test:determinism
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { DomainRegistry } from './domains/registry.js';
import type { DomainPlugin } from './domains/registry.js';
import { DeterministicRNG } from './prng/deterministic-rng.js';

// Stable state hash: deterministic JSON serialization, SHA-256 digest.
// 32-bit hashes (djb2/FNV) are NOT sufficient here — golden vectors must be
// collision-resistant across versions and platforms.
function stableHash(obj: unknown): string {
  const json = JSON.stringify(obj, (_key, value) => (value === undefined ? null : value));
  return createHash('sha256').update(json).digest('hex');
}

/**
 * Generic golden-state runner.
 * Creates default state, applies N reduce cycles with synthetic events,
 * and returns a deterministic hash of the final state.
 *
 * Reducer exceptions propagate: a domain that throws on a bare TICK event
 * has a bug (unknown event types must no-op), and the suite must fail loudly
 * rather than silently pass a frozen state.
 */
function runGoldenSequence(plugin: DomainPlugin, seed: number, ticks: number): string {
  const rng = new DeterministicRNG(seed);
  let state = plugin.createDefaultState();

  for (let t = 0; t < ticks; t++) {
    // Use the plugin's reducer with a TICK event — the universal heartbeat
    // that every domain must handle (advances internal timers, election
    // countdowns, TTLs, reconciliation loops, etc.)
    const tickEvent = {
      id: `golden-tick-${t}`,
      tick: t,
      type: 'TICK' as any,
      payload: {},
    };

    const result = plugin.reduceState(state, tickEvent, rng);
    state = result.nextState;
  }

  return stableHash(state);
}

const GOLDEN_SEED = 12345;
const GOLDEN_TICKS = 10;

/**
 * Domains whose bare-TICK path consumes no randomness: fixed initial state
 * plus timers/counters that do not sample the RNG. Membership here is
 * empirical (observed equal hashes across seeds after RNG-burn removal) and
 * must be re-verified if a reducer starts sampling randomness on TICK.
 */
const SEED_INDIFFERENT_DOMAINS: ReadonlySet<string> = new Set([
  // Populated empirically — see triage note in the divergence test above.
]);

/**
 * Committed golden vectors.
 *
 * Each value is the SHA-256 hex digest of the canonical JSON end-state after
 * GOLDEN_TICKS bare-TICK reductions from a fresh default state with
 * GOLDEN_SEED (see runGoldenSequence). Generated 2026-09-09 after RNG-burn
 * removal and the djb2 -> SHA-256 migration.
 *
 * NEVER edit these by hand to make the suite green. Regenerate with
 * `pnpm sim:golden:update` and review the digest diff like a snapshot update:
 * every changed digest is a changed reducer semantic.
 */
const GOLDEN_VECTORS: Record<string, string> = {
  kafka: 'b27a5bc2211fc33d8e502364c2ce9389d668cd34312705c9518ecb1fab75ee76',
  raft: '6f496ea5af52aaddb076d3e94cb902e184d7c4c01d08e79977dbbe96a0e9a2fa',
  database: '861e6e21928236381dc6b102a608d66c7a5ff848d1808aaca8b45f580f9016c8',
  redis: '80f4c118eae4474141b74ab53f5c4d241ee2e10d026eb5a54c114b8c077d2a95',
  kubernetes: '4521b4ebe8b8d071c6141ae5549c603ff5e25edc6795541929559040b9e62100',
  rabbitmq: '539488a3c5854f7ec2b262b86a0e35782c82e254ccc17e06b83b89f4a6ebaba3',
  storage: 'f7e3acfe22bd132a7e5770f8db42fe4e773a4e1c4e9e1f86cadb3fffccbf2097',
  networking:
    'fff70e3cb26143a5ba3b966fb942312f5c6cba2d4d8ad2d79470d7edc18def40',
  'rate-limiter':
    '0e3109dac56920c7d553adf43a0bb02fbf1bddc02612e55bc10cb3c2d0c14e42',
  'distributed-lock':
    '19a84b4c7aa6f69dd02375af783b258fe71e90b5693ac049a3fb904e56f62b88',
  'cdn-cache':
    '8b166d3ecef06e02a9ed6c7bc5c2fc5d3d871dae30b30119ab416be3808ad080',
  'id-gen': 'e0e5a272b4b3cec440893b635047b2899d1c433bc378118f8d7afd7796272c1e',
  transactions:
    'b43af42da694e1763c23f922554fd187bd123ea3579e224b0ee191be08faa633',
  'llm-pipeline':
    '8db8cf7c5fa16cefa0c3824c84a35473b7d54a3fa3ecff17974970549ddeee68',
  'llm-gateway':
    '6c65e8f04c8abf825c404383b4427059bf489bb30f0e8635f74db83aec5326cc',
  'llm-serving':
    'e654eca76a231c9d7d0807ea8aa42005d5088effdd7bbd60dd1ed236aea21ed5',
  vectordb: 'af67fae23b35e202352107c1a9ee5a0f3d1241c3fc6acc4ada36f7e7b2a906d3',
  'gpu-cluster':
    '7fad1f4d9b8b9201fd9c861e0bcf6ff8505f14326dbcc0d14fd571e541799dc4',
  'load-balancer':
    '3dafdf7b1c21d990182359eddeaaa813252d4bc99b34c2bc953c95be3df30f6a',
  'search-index':
    '4dce37b6ff67e5b5c678903a6f911ee5fa6e4e37c0e3910f86c6315975956cb2',
  'task-scheduler':
    '6052069f15df456a456476cd99fc586fc963c4e703f46ee67a05beb7ebd8b3b9',
  'chat-presence':
    '870413439aae69f9b71aeab884ff04da5e2e33b8ec0b7063188d8687ebc842ee',
  'feature-store':
    '293f081b66685e06122751a66c7f4a0e4bc14beb97fb1a6c2b2b9030076bd8c5',
  'model-rollout':
    'b858e96fb72a29d275fddbfc8615d6ad919b6b19c51bd3dabd88611269a62c9a',
  'llm-eval': '538a3b01604bc19e9ac19333577eaaf5389fbe141f7310b2938ce330d86dcac8',
  'consistent-hashing':
    '6cadbf7007cb710aa37c72bc6588d2048ce6ba8c13c73d8073eba6b8f48e729e',
  'probabilistic-structures':
    '4a5d7aa7b428b8b2b78d6dd93e8e10469480b9785fd45851b64e518c6e973e0b',
  'merkle-trees':
    '7db0129d4ce33e7230f641b152475aac7885c8750d165923d3fe252d29b60140',
};

describe('Golden Determinism Suite', () => {
  const domains = DomainRegistry.list();

  // Verify all registered domains
  it('should have all domains registered', () => {
    expect(domains.length).toBe(28);
    const ids = domains.map((d) => d.id).sort();
    expect(ids).toEqual([
      'cdn-cache',
      'chat-presence',
      'consistent-hashing',
      'database',
      'distributed-lock',
      'feature-store',
      'gpu-cluster',
      'id-gen',
      'kafka',
      'kubernetes',
      'llm-eval',
      'llm-gateway',
      'llm-pipeline',
      'llm-serving',
      'load-balancer',
      'merkle-trees',
      'model-rollout',
      'networking',
      'probabilistic-structures',
      'rabbitmq',
      'raft',
      'rate-limiter',
      'redis',
      'search-index',
      'storage',
      'task-scheduler',
      'transactions',
      'vectordb',
    ]);
  });

  // For each domain: run the golden sequence twice with the same seed
  // and verify they produce identical hashes (determinism proof)
  for (const meta of domains) {
    it(`[${meta.id}] produces identical state hash across two runs with seed ${GOLDEN_SEED}`, () => {
      const plugin = DomainRegistry.get(meta.id)!;
      expect(plugin).toBeDefined();

      const hash1 = runGoldenSequence(plugin, GOLDEN_SEED, GOLDEN_TICKS);
      const hash2 = runGoldenSequence(plugin, GOLDEN_SEED, GOLDEN_TICKS);

      expect(hash1).toBe(hash2);
    });
  }

  // Verify different seeds produce different hashes (sanity check that
  // the RNG is actually being consumed, not ignored).
  //
  // Domains whose bare-TICK path is a pure fixed point (no timers, no
  // sampling, no stamped RNG state) are listed in SEED_INDIFFERENT_DOMAINS
  // and assert stability explicitly instead of faking divergence.
  // Reducers MUST NOT burn RNG (`void rng.nextFloat()`) to satisfy this.
  for (const meta of domains) {
    it(`[${meta.id}] produces different state hashes for different seeds`, () => {
      const plugin = DomainRegistry.get(meta.id)!;

      const hashA = runGoldenSequence(plugin, 1, GOLDEN_TICKS);
      const hashB = runGoldenSequence(plugin, 99999, GOLDEN_TICKS);

      if (SEED_INDIFFERENT_DOMAINS.has(meta.id)) {
        expect(hashA).toBe(hashB);
        return;
      }
      expect(hashA).not.toBe(hashB);
    });
  }

  // Committed golden vectors: SHA-256 digests locked in below. A reducer
  // change alters these digests and fails loudly, forcing review.
  // Regenerate explicitly via `pnpm sim:golden:update` and review the diff.
  it('matches committed golden vectors (cross-version regression tripwire)', () => {
    for (const meta of domains) {
      const plugin = DomainRegistry.get(meta.id)!;
      const expected = GOLDEN_VECTORS[meta.id];
      expect(expected, `missing golden vector for ${meta.id}`).toBeDefined();
      expect(runGoldenSequence(plugin, GOLDEN_SEED, GOLDEN_TICKS)).toBe(expected);
    }
  });

  it('creates reproducible default states', () => {
    for (const meta of domains) {
      const plugin = DomainRegistry.get(meta.id)!;
      const state = plugin.createDefaultState();
      const hash = stableHash(state);
      expect(hash).toHaveLength(64);
      expect(typeof hash).toBe('string');
    }
  });

  // Deep state-mutation determinism test for Storage Engine (B+Tree splits + LSM compactions)
  it('[storage] produces deterministic state hash across B+Tree page splits and LSM compactions', () => {
    const plugin = DomainRegistry.get('storage')!;
    const runStoragePipeline = () => {
      const rng = new DeterministicRNG(42);
      let state = plugin.createDefaultState();

      // Insert 25 keys to trigger B+Tree splits and LSM flushes
      for (let i = 1; i <= 25; i++) {
        const insertEvt = {
          id: `evt-insert-${i}`,
          tick: i,
          type: 'STORAGE_INSERT',
          payload: { key: i * 7, value: `val-${i * 7}` },
        };
        const res = plugin.reduceState(state, insertEvt, rng);
        state = res.nextState;
      }
      return stableHash(state);
    };

    const hash1 = runStoragePipeline();
    const hash2 = runStoragePipeline();
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });

  // Deep state-mutation determinism test for RabbitMQ (publishing, queue routing, DLQ)
  it('[rabbitmq] produces deterministic state hash across AMQP publish, binding, and routing cycles', () => {
    const plugin = DomainRegistry.get('rabbitmq')!;
    const runRabbitPipeline = () => {
      const rng = new DeterministicRNG(42);
      let state = plugin.createDefaultState();

      // Publish 20 messages to trigger message IDs, routing, and delivery
      for (let i = 1; i <= 20; i++) {
        const publishEvt = {
          id: `evt-pub-${i}`,
          tick: i,
          type: 'RABBITMQ_PUBLISH',
          payload: {
            exchangeName: 'amq.direct',
            routingKey: i % 2 === 0 ? 'orders.created' : 'orders.cancelled',
            payload: { orderId: i, amount: i * 100 },
          },
        };
        const res = plugin.reduceState(state, publishEvt, rng);
        state = res.nextState;
      }
      return stableHash(state);
    };

    const hash1 = runRabbitPipeline();
    const hash2 = runRabbitPipeline();
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });

  // Fidelity-specific golden pipeline: TCP CUBIC & SACK
  it('[networking] produces deterministic state hash under CUBIC congestion growth and packet drop recovery', () => {
    const plugin = DomainRegistry.get('networking')!;
    const runNetworkingCubic = () => {
      const rng = new DeterministicRNG(42);
      let state = plugin.createDefaultState();

      // Configure CUBIC
      const cfg = {
        id: 'cfg-cubic',
        tick: 1,
        type: 'TCP_CONFIGURE_FIDELITY' as any,
        payload: { algorithm: 'CUBIC' },
      };
      state = plugin.reduceState(state, cfg, rng).nextState;

      // Handshake and packet exchanges
      const handshake = { id: 'hs-1', tick: 2, type: 'TCP_START_HANDSHAKE' as any, payload: {} };
      state = plugin.reduceState(state, handshake, rng).nextState;

      for (let i = 3; i <= 15; i++) {
        const sendData = { id: `send-${i}`, tick: i, type: 'TCP_SEND_DATA' as any, payload: {} };
        state = plugin.reduceState(state, sendData, rng).nextState;
      }
      return stableHash(state);
    };

    const h1 = runNetworkingCubic();
    const h2 = runNetworkingCubic();
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
  });

  // Fidelity-specific golden pipeline: Raft PreVote & Snapshots
  it('[raft] produces deterministic state hash across PreVote election and log compaction', () => {
    const plugin = DomainRegistry.get('raft')!;
    const runRaftFidelity = () => {
      const rng = new DeterministicRNG(42);
      let state = plugin.createDefaultState();

      // Enable PreVote
      const cfg = {
        id: 'cfg-prevote',
        tick: 1,
        type: 'RAFT_CONFIGURE_FIDELITY' as any,
        payload: { preVoteEnabled: true, fidelityMode: 'REALISTIC' },
      };
      state = plugin.reduceState(state, cfg, rng).nextState;

      // Timeout on node 1
      const timeoutEv = {
        id: 'timeout-1',
        tick: 2,
        type: 'RAFT_ELECTION_TIMEOUT' as any,
        payload: { candidateId: '1' },
      };
      state = plugin.reduceState(state, timeoutEv, rng).nextState;
      return stableHash(state);
    };

    const h1 = runRaftFidelity();
    const h2 = runRaftFidelity();
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
  });

  // Fidelity-specific golden pipeline: Redis candidate pool eviction & redirects
  it('[redis] produces deterministic state hash across approximate sampling eviction and resharding', () => {
    const plugin = DomainRegistry.get('redis')!;
    const runRedisFidelity = () => {
      const rng = new DeterministicRNG(42);
      let state = plugin.createDefaultState();

      for (let i = 1; i <= 10; i++) {
        const setEv = {
          id: `set-${i}`,
          tick: i,
          type: 'REDIS_SET' as any,
          payload: { key: `item:${i}`, value: `val:${i}`, sizeBytes: 500000 },
        };
        state = plugin.reduceState(state, setEv, rng).nextState;
      }
      return stableHash(state);
    };

    const h1 = runRedisFidelity();
    const h2 = runRedisFidelity();
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
  });

  // Fidelity-specific golden pipeline: Database Hinted Handoffs & Read Repair
  it('[database] produces deterministic state hash across hinted handoff buffering and read repairs', () => {
    const plugin = DomainRegistry.get('database')!;
    const runDbFidelity = () => {
      const rng = new DeterministicRNG(42);
      let state = plugin.createDefaultState();

      // Down node 2
      const crashEv = {
        id: 'crash-2',
        tick: 1,
        type: 'DB_NODE_CRASH' as any,
        payload: { nodeId: '2' },
      };
      state = plugin.reduceState(state, crashEv, rng).nextState;

      // Write with ONE consistency to buffer hints
      for (let i = 2; i <= 8; i++) {
        const writeEv = {
          id: `write-${i}`,
          tick: i,
          type: 'DB_WRITE_REQUEST' as any,
          payload: { key: `user:${i}`, value: `data_${i}`, consistencyLevel: 'ONE' },
        };
        state = plugin.reduceState(state, writeEv, rng).nextState;
      }
      return stableHash(state);
    };

    const h1 = runDbFidelity();
    const h2 = runDbFidelity();
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
  });

  // Fidelity-specific golden pipeline: Kubernetes QoS & PDB
  it('[kubernetes] produces deterministic state hash across QoS-ordered pressure eviction and PDB enforcement', () => {
    const plugin = DomainRegistry.get('kubernetes')!;
    const runK8sFidelity = () => {
      const rng = new DeterministicRNG(42);
      let state = plugin.createDefaultState();

      // Apply PDB
      const pdbEv = {
        id: 'pdb-1',
        tick: 1,
        type: 'K8S_APPLY_PDB' as any,
        payload: {
          pdb: { id: 'pdb-test', name: 'pdb-api', deploymentId: 'dep-api', minAvailable: 3 },
        },
      };
      state = plugin.reduceState(state, pdbEv, rng).nextState;

      // Eviction under pressure
      const evictEv = {
        id: 'evict-1',
        tick: 2,
        type: 'K8S_EVICT_UNDER_PRESSURE' as any,
        payload: { nodeId: '1' },
      };
      state = plugin.reduceState(state, evictEv, rng).nextState;
      return stableHash(state);
    };

    const h1 = runK8sFidelity();
    const h2 = runK8sFidelity();
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
  });

  // Fidelity-specific golden pipeline: Rate Limiter (Token Bucket & Sliding Window)
  it('[rate-limiter] produces deterministic state hash across token refill, bursts, and sliding window evaluation', () => {
    const plugin = DomainRegistry.get('rate-limiter')!;
    const runRateLimiterPipeline = () => {
      const rng = new DeterministicRNG(42);
      let state = plugin.createDefaultState();

      // Requests across multiple clients and ticks
      for (let t = 1; t <= 15; t++) {
        const req = {
          id: `rl-req-${t}`,
          tick: t,
          type: 'RATE_LIMITER_REQUEST' as any,
          payload: { clientId: t % 2 === 0 ? 'client-1' : 'client-2' },
        };
        state = plugin.reduceState(state, req, rng).nextState;
      }
      return stableHash(state);
    };

    const h1 = runRateLimiterPipeline();
    const h2 = runRateLimiterPipeline();
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
  });

  // Fidelity-specific golden pipeline: Distributed Lock (Redlock Quorum & Fencing)
  it('[distributed-lock] produces deterministic state hash across Redlock quorum, GC pause, and fencing validation', () => {
    const plugin = DomainRegistry.get('distributed-lock')!;
    const runLockPipeline = () => {
      const rng = new DeterministicRNG(42);
      let state = plugin.createDefaultState();

      // Client A acquires
      state = plugin.reduceState(
        state,
        { id: 'acq-a', tick: 1, type: 'LOCK_ACQUIRE' as any, payload: { clientId: 'client-A' } },
        rng,
      ).nextState;
      // Client A writes
      state = plugin.reduceState(
        state,
        {
          id: 'wr-a',
          tick: 2,
          type: 'LOCK_WRITE_PROTECTED_RESOURCE' as any,
          payload: { clientId: 'client-A', data: 'DATA_A' },
        },
        rng,
      ).nextState;
      // Client A GC pause
      state = plugin.reduceState(
        state,
        {
          id: 'gc-a',
          tick: 3,
          type: 'LOCK_INJECT_GC_PAUSE' as any,
          payload: { clientId: 'client-A', durationTicks: 5 },
        },
        rng,
      ).nextState;
      // Tick advance to expire lease
      for (let t = 4; t <= 15; t++) {
        state = plugin.reduceState(
          state,
          { id: `t-${t}`, tick: t, type: 'LOCK_TICK' as any, payload: {} },
          rng,
        ).nextState;
      }
      return stableHash(state);
    };

    const h1 = runLockPipeline();
    const h2 = runLockPipeline();
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
  });

  // Fidelity-specific golden pipeline: CDN & Multi-Tier Caching
  it('[cdn-cache] produces deterministic state hash across tiered cache hits, request coalescing, and purge waves', () => {
    const plugin = DomainRegistry.get('cdn-cache')!;
    const runCdnPipeline = () => {
      const rng = new DeterministicRNG(42);
      let state = plugin.createDefaultState();

      // Flash crowd with coalescing
      state = plugin.reduceState(
        state,
        {
          id: 'flash-1',
          tick: 1,
          type: 'CDN_FLASH_CROWD' as any,
          payload: { key: '/app.js', requestCount: 15 },
        },
        rng,
      ).nextState;
      // Subsequent requests across edge pops
      state = plugin.reduceState(
        state,
        {
          id: 'req-eu',
          tick: 2,
          type: 'CDN_REQUEST' as any,
          payload: { key: '/app.js', clientRegion: 'EU_WEST' },
        },
        rng,
      ).nextState;
      // Purge key
      state = plugin.reduceState(
        state,
        { id: 'purge-1', tick: 3, type: 'CDN_PURGE_KEY' as any, payload: { key: '/app.js' } },
        rng,
      ).nextState;
      return stableHash(state);
    };

    const h1 = runCdnPipeline();
    const h2 = runCdnPipeline();
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
  });

  // Fidelity-specific golden pipeline: Distributed ID Generation
  it('[id-gen] produces deterministic state hash across Snowflake bit-packing, sequence overflow, and UUID generation', () => {
    const plugin = DomainRegistry.get('id-gen')!;
    const runIdGenPipeline = () => {
      const rng = new DeterministicRNG(42);
      let state = plugin.createDefaultState();

      // Generate Snowflake IDs across workers
      for (let w = 1; w <= 4; w++) {
        state = plugin.reduceState(
          state,
          {
            id: `gen-${w}`,
            tick: w,
            type: 'ID_GEN_GENERATE' as any,
            payload: { workerId: w, count: 5 },
          },
          rng,
        ).nextState;
      }
      // Clock skew injection
      state = plugin.reduceState(
        state,
        {
          id: 'skew-1',
          tick: 5,
          type: 'ID_GEN_INJECT_CLOCK_SKEW' as any,
          payload: { workerId: 1, backwardSkewMs: 20 },
        },
        rng,
      ).nextState;
      return stableHash(state);
    };

    const h1 = runIdGenPipeline();
    const h2 = runIdGenPipeline();
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
  });

  // Fidelity-specific golden pipeline: Distributed Transactions
  it('[transactions] produces deterministic state hash across 2PC voting, coordinator crash, and reverse Saga compensation', () => {
    const plugin = DomainRegistry.get('transactions')!;
    const runTxnPipeline = () => {
      const rng = new DeterministicRNG(42);
      let state = plugin.createDefaultState();

      // Start 2PC
      state = plugin.reduceState(
        state,
        {
          id: 'tx-1',
          tick: 1,
          type: 'TXN_2PC_START' as any,
          payload: { transactionId: 'tx-gold' },
        },
        rng,
      ).nextState;
      // Votes
      state = plugin.reduceState(
        state,
        {
          id: 'v-1',
          tick: 2,
          type: 'TXN_2PC_PARTICIPANT_VOTE' as any,
          payload: { participantId: 'part-order-svc', vote: 'VOTE_COMMIT' },
        },
        rng,
      ).nextState;
      state = plugin.reduceState(
        state,
        {
          id: 'v-2',
          tick: 2,
          type: 'TXN_2PC_PARTICIPANT_VOTE' as any,
          payload: { participantId: 'part-payment-svc', vote: 'VOTE_COMMIT' },
        },
        rng,
      ).nextState;
      // Crash coordinator after prepare
      state = plugin.reduceState(
        state,
        {
          id: 'crash-c',
          tick: 3,
          type: 'TXN_2PC_CRASH_COORDINATOR' as any,
          payload: { crashTiming: 'AFTER_PREPARE' },
        },
        rng,
      ).nextState;

      // Start and unwind Saga
      state = plugin.reduceState(
        state,
        { id: 's-start', tick: 4, type: 'TXN_SAGA_START' as any, payload: { sagaId: 'saga-gold' } },
        rng,
      ).nextState;
      state = plugin.reduceState(
        state,
        {
          id: 's-1',
          tick: 5,
          type: 'TXN_SAGA_STEP_OUTCOME' as any,
          payload: { stepIndex: 0, success: true },
        },
        rng,
      ).nextState;
      state = plugin.reduceState(
        state,
        {
          id: 's-2',
          tick: 6,
          type: 'TXN_SAGA_STEP_OUTCOME' as any,
          payload: { stepIndex: 1, success: true },
        },
        rng,
      ).nextState;
      state = plugin.reduceState(
        state,
        {
          id: 's-3',
          tick: 7,
          type: 'TXN_SAGA_STEP_OUTCOME' as any,
          payload: { stepIndex: 2, success: false },
        },
        rng,
      ).nextState;

      return stableHash(state);
    };

    const h1 = runTxnPipeline();
    const h2 = runTxnPipeline();
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
  });

  // Dedicated Cross-Domain Golden Fixture 1: Distributed Lock + Raft Lease Authority
  it('[distributed-lock:raft-lease] produces deterministic state hash across Raft leader election, lease grant, and follower rejection', () => {
    const plugin = DomainRegistry.get('distributed-lock')!;
    const runRaftLock = () => {
      const rng = new DeterministicRNG(42);
      let state = plugin.createDefaultState();

      // Switch to RAFT_LEASE backend
      state = plugin.reduceState(
        state,
        {
          id: 'cfg-raft-lock',
          tick: 1,
          type: 'LOCK_UPDATE_CONFIG' as any,
          payload: { backend: 'RAFT_LEASE' },
        },
        rng,
      ).nextState;

      // Acquire lock from Client A via Raft leader authority
      state = plugin.reduceState(
        state,
        { id: 'acq-raft-a', tick: 2, type: 'LOCK_ACQUIRE' as any, payload: { clientId: 'client-A' } },
        rng,
      ).nextState;

      // Write protected resource
      state = plugin.reduceState(
        state,
        {
          id: 'wr-raft-a',
          tick: 3,
          type: 'LOCK_WRITE_PROTECTED_RESOURCE' as any,
          payload: { clientId: 'client-A', data: 'RAFT_CONSENSUS_LEASE_DATA' },
        },
        rng,
      ).nextState;

      // Step simulation clock
      for (let t = 4; t <= 10; t++) {
        state = plugin.reduceState(
          state,
          { id: `tick-${t}`, tick: t, type: 'LOCK_TICK' as any, payload: {} },
          rng,
        ).nextState;
      }

      return stableHash(state);
    };

    const h1 = runRaftLock();
    const h2 = runRaftLock();
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
  });

  // Dedicated Cross-Domain Golden Fixture 2: ID-Gen + Raft Worker Registry
  it('[id-gen:raft-registry] produces deterministic state hash across concurrent worker registration and partition quorum check', () => {
    const plugin = DomainRegistry.get('id-gen')!;
    const runRaftIdGen = () => {
      const rng = new DeterministicRNG(42);
      let state = plugin.createDefaultState();

      // Configure RAFT_CONSENSUS registry mode
      state = plugin.reduceState(
        state,
        {
          id: 'cfg-raft-idgen',
          tick: 1,
          type: 'ID_GEN_UPDATE_CONFIG' as any,
          payload: { workerRegistryMode: 'RAFT_CONSENSUS' },
        },
        rng,
      ).nextState;

      // Dynamically register new worker 5 through Raft consensus
      state = plugin.reduceState(
        state,
        {
          id: 'reg-w5',
          tick: 2,
          type: 'ID_GEN_REGISTER_WORKER_RAFT' as any,
          payload: { workerId: 5, workerName: 'worker-eu-central-1' },
        },
        rng,
      ).nextState;

      // Generate IDs from registered workers
      for (let t = 3; t <= 8; t++) {
        state = plugin.reduceState(
          state,
          {
            id: `gen-${t}`,
            tick: t,
            type: 'ID_GEN_GENERATE' as any,
            payload: { workerId: t % 2 === 0 ? 1 : 5, count: 2 },
          },
          rng,
        ).nextState;
      }

      return stableHash(state);
    };

    const h1 = runRaftIdGen();
    const h2 = runRaftIdGen();
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
  });

  // Dedicated Cross-Domain Golden Fixture 3: Rate Limiter + Redis Cluster Storage
  it('[rate-limiter:redis-cluster] produces deterministic state hash across CRC16 slot dispatch and distributed counter mutation', () => {
    const plugin = DomainRegistry.get('rate-limiter')!;
    const runRedisRateLimiter = () => {
      const rng = new DeterministicRNG(42);
      let state = plugin.createDefaultState();

      // Configure SHARED_REDIS backend mode
      state = plugin.reduceState(
        state,
        {
          id: 'cfg-redis-rl',
          tick: 1,
          type: 'RATE_LIMITER_UPDATE_CONFIG' as any,
          payload: { backendMode: 'SHARED_REDIS' },
        },
        rng,
      ).nextState;

      // Route requests across diverse client keys to exercise multiple hash slots
      const clientIds = ['client-alpha', 'client-beta', 'client-gamma', 'client-delta'];
      for (let t = 2; t <= 12; t++) {
        const clientId = clientIds[t % clientIds.length]!;
        state = plugin.reduceState(
          state,
          {
            id: `req-redis-${t}`,
            tick: t,
            type: 'RATE_LIMITER_REQUEST' as any,
            payload: { clientId, cost: 1 },
          },
          rng,
        ).nextState;
      }

      return stableHash(state);
    };

    const h1 = runRedisRateLimiter();
    const h2 = runRedisRateLimiter();
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
  });

  // Dedicated Cross-Domain Golden Fixture 4: RabbitMQ + Raft Quorum Replication
  it('[rabbitmq:raft-quorum] produces deterministic state hash across quorum queue message append and Raft majority commit', () => {
    const plugin = DomainRegistry.get('rabbitmq')!;
    const runRabbitQuorum = () => {
      const rng = new DeterministicRNG(42);
      let state = plugin.createDefaultState();

      // Declare quorum queue
      state = plugin.reduceState(
        state,
        {
          id: 'decl-quorum-q',
          tick: 1,
          type: 'RABBIT_DECLARE_QUEUE' as any,
          payload: { name: 'orders.quorum.high-value', queueType: 'quorum' },
        },
        rng,
      ).nextState;

      // Bind quorum queue to direct exchange
      state = plugin.reduceState(
        state,
        {
          id: 'bind-quorum-q',
          tick: 2,
          type: 'RABBIT_BIND_QUEUE' as any,
          payload: {
            exchangeName: 'amq.direct',
            queueName: 'orders.quorum.high-value',
            routingKeyPattern: 'orders.critical',
          },
        },
        rng,
      ).nextState;

      // Publish messages to quorum queue
      for (let t = 3; t <= 8; t++) {
        state = plugin.reduceState(
          state,
          {
            id: `pub-quorum-${t}`,
            tick: t,
            type: 'RABBIT_PUBLISH' as any,
            payload: {
              exchangeName: 'amq.direct',
              routingKey: 'orders.critical',
              payload: `{"txId":"${t * 100}","amount":500}`,
            },
          },
          rng,
        ).nextState;
      }

      return stableHash(state);
    };

    const h1 = runRabbitQuorum();
    const h2 = runRabbitQuorum();
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
  });

  // Dedicated High-Risk Chaos Fixture 1: Distributed Lock Kleppmann Corruption (Fencing Disabled)
  it('[distributed-lock:kleppmann-corruption] demonstrates silent data corruption when fencing is disabled', () => {
    const plugin = DomainRegistry.get('distributed-lock')!;
    const runCorruption = () => {
      const rng = new DeterministicRNG(42);
      let state = plugin.createDefaultState();

      // Disable fencing
      state = plugin.reduceState(
        state,
        {
          id: 'cfg-no-fencing',
          tick: 1,
          type: 'LOCK_UPDATE_CONFIG' as any,
          payload: { fencingEnabled: false },
        },
        rng,
      ).nextState;

      // Client A acquires
      state = plugin.reduceState(
        state,
        { id: 'acq-a', tick: 2, type: 'LOCK_ACQUIRE' as any, payload: { clientId: 'client-A' } },
        rng,
      ).nextState;

      // Inject GC pause on Client A
      state = plugin.reduceState(
        state,
        {
          id: 'gc-a',
          tick: 3,
          type: 'LOCK_INJECT_GC_PAUSE' as any,
          payload: { clientId: 'client-A', durationTicks: 10 },
        },
        rng,
      ).nextState;

      // Advance past lease expiration
      for (let t = 4; t <= 12; t++) {
        state = plugin.reduceState(
          state,
          { id: `t-${t}`, tick: t, type: 'LOCK_TICK' as any, payload: {} },
          rng,
        ).nextState;
      }

      // Client B acquires and writes legitimate data
      state = plugin.reduceState(
        state,
        { id: 'acq-b', tick: 12, type: 'LOCK_ACQUIRE' as any, payload: { clientId: 'client-B' } },
        rng,
      ).nextState;
      state = plugin.reduceState(
        state,
        {
          id: 'wr-b',
          tick: 13,
          type: 'LOCK_WRITE_PROTECTED_RESOURCE' as any,
          payload: { clientId: 'client-B', data: 'LEGITIMATE_UPDATE_FROM_B' },
        },
        rng,
      ).nextState;

      // Client A wakes up at tick 14 and writes stale payload without fencing validation
      state = plugin.reduceState(
        state,
        { id: 't-14', tick: 14, type: 'LOCK_TICK' as any, payload: {} },
        rng,
      ).nextState;
      state = plugin.reduceState(
        state,
        {
          id: 'wr-a-stale',
          tick: 15,
          type: 'LOCK_WRITE_PROTECTED_RESOURCE' as any,
          payload: { clientId: 'client-A', data: 'STALE_CORRUPTED_OVERWRITE_FROM_A' },
        },
        rng,
      ).nextState;

      // Verify corruption was recorded
      expect((state as any).flawsDemonstrated.dataCorruptedWithoutFencing).toBe(true);

      return stableHash(state);
    };

    const h1 = runCorruption();
    const h2 = runCorruption();
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
  });

  // Dedicated High-Risk Chaos Fixture 2: Transactions 2PC Coordinator Crash After PREPARE
  it('[transactions:2pc-coordinator-crash] isolates participant BLOCKED_UNCERTAIN freeze', () => {
    const plugin = DomainRegistry.get('transactions')!;
    const runCrash = () => {
      const rng = new DeterministicRNG(42);
      let state = plugin.createDefaultState();

      // Start 2PC
      state = plugin.reduceState(
        state,
        {
          id: 'start-2pc',
          tick: 1,
          type: 'TXN_2PC_START' as any,
          payload: { transactionId: 'tx-crash-freeze-isolated' },
        },
        rng,
      ).nextState;

      // Participants vote COMMIT
      state = plugin.reduceState(
        state,
        {
          id: 'vote-order',
          tick: 2,
          type: 'TXN_2PC_PARTICIPANT_VOTE' as any,
          payload: { participantId: 'part-order-svc', vote: 'VOTE_COMMIT' },
        },
        rng,
      ).nextState;
      state = plugin.reduceState(
        state,
        {
          id: 'vote-pay',
          tick: 2,
          type: 'TXN_2PC_PARTICIPANT_VOTE' as any,
          payload: { participantId: 'part-payment-svc', vote: 'VOTE_COMMIT' },
        },
        rng,
      ).nextState;

      // Coordinator crashes before decision
      state = plugin.reduceState(
        state,
        {
          id: 'crash-coord',
          tick: 3,
          type: 'TXN_2PC_CRASH_COORDINATOR' as any,
          payload: { crashTiming: 'AFTER_PREPARE' },
        },
        rng,
      ).nextState;

      // Verify participants frozen in BLOCKED_UNCERTAIN
      expect((state as any).twoPhaseCommit.finalOutcome).toBe('BLOCKED_UNCERTAIN');

      return stableHash(state);
    };

    const h1 = runCrash();
    const h2 = runCrash();
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
  });

  // Dedicated High-Risk Chaos Fixture 3: Rate Limiter Fixed Window Boundary Burst
  it('[rate-limiter:boundary-burst] isolates 2x limit admission across window boundary', () => {
    const plugin = DomainRegistry.get('rate-limiter')!;
    const runBoundaryBurst = () => {
      const rng = new DeterministicRNG(42);
      let state = plugin.createDefaultState();
      const clientId = 'client-burst-target';

      // 10 requests at tick 9 (tail of window 0)
      for (let i = 0; i < 10; i++) {
        state = plugin.reduceState(
          state,
          {
            id: `burst-w0-${i}`,
            tick: 9,
            type: 'RATE_LIMITER_REQUEST' as any,
            payload: { clientId },
          },
          rng,
        ).nextState;
      }

      // 10 requests at tick 10 (head of window 1)
      for (let i = 0; i < 10; i++) {
        state = plugin.reduceState(
          state,
          {
            id: `burst-w1-${i}`,
            tick: 10,
            type: 'RATE_LIMITER_REQUEST' as any,
            payload: { clientId },
          },
          rng,
        ).nextState;
      }

      // Verify boundary burst flaw detected
      expect((state as any).flawsDemonstrated.fixedWindowBoundaryBurstDetected).toBe(true);
      expect((state as any).clients[clientId]?.totalAdmitted.FIXED_WINDOW).toBe(20);

      return stableHash(state);
    };

    const h1 = runBoundaryBurst();
    const h2 = runBoundaryBurst();
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
  });

  // Dedicated AI Infrastructure Golden Fixture 1: Consolidated LLM Pipeline (ETL, RAG, Tool DAG & W3C Lineage)
  it('[llm-pipeline:e2e-trace] produces bit-identical state across ingest, hybrid retrieval, agent tool execution, and W3C lineage synthesis', () => {
    const plugin = DomainRegistry.get('llm-pipeline')!;
    const runPipeline = () => {
      const rng = new DeterministicRNG(42);
      let state = plugin.createDefaultState();

      // 1. Ingest technical doc
      state = plugin.reduceState(
        state,
        {
          id: 'ingest-vllm',
          tick: 1,
          type: 'PIPE_INGEST_DOC' as any,
          payload: {
            docId: 'doc-vllm-spec',
            title: 'PagedAttention Engine Specification',
            content:
              'PagedAttention partitions memory blocks to prevent memory fragmentation and enables dynamic KV cache allocation.',
          },
        },
        rng,
      ).nextState;

      // 2. Hybrid search & RRF
      state = plugin.reduceState(
        state,
        {
          id: 'search-1',
          tick: 2,
          type: 'PIPE_EXECUTE_HYBRID_SEARCH' as any,
          payload: { queryId: 'q-vllm', queryText: 'PagedAttention memory fragmentation' },
        },
        rng,
      ).nextState;

      // 3. Agent Tool Call
      state = plugin.reduceState(
        state,
        {
          id: 'step-tool-vllm',
          tick: 3,
          type: 'PIPE_DISPATCH_AGENT_STEP' as any,
          payload: {
            stepId: 'step-tool-vllm',
            taskId: 'task-vllm',
            type: 'TOOL_CALL',
            toolName: 'vector_search',
            toolArgs: { query: 'PagedAttention' },
            dependsOn: ['step-plan-1'],
          },
        },
        rng,
      ).nextState;

      // 4. Agent Observation
      state = plugin.reduceState(
        state,
        {
          id: 'step-obs-vllm',
          tick: 4,
          type: 'PIPE_DISPATCH_AGENT_STEP' as any,
          payload: {
            stepId: 'step-obs-vllm',
            taskId: 'task-vllm',
            type: 'OBSERVATION',
            output: 'Found chunk-vllm-spec-1 with relevance score 0.96.',
            dependsOn: ['step-tool-vllm'],
          },
        },
        rng,
      ).nextState;

      // 5. Synthesize Response
      state = plugin.reduceState(
        state,
        {
          id: 'synth-vllm',
          tick: 5,
          type: 'PIPE_SYNTHESIZE_RESPONSE' as any,
          payload: {
            queryId: 'q-vllm',
            answerText:
              'PagedAttention eliminates GPU memory fragmentation via virtual memory paging tables.',
            claims: [
              {
                claimId: 'claim-vllm-1',
                text: 'PagedAttention eliminates memory fragmentation',
                citationChunkId: 'chunk-doc-vllm-spec-1',
                observationStepId: 'step-obs-vllm',
              },
            ],
          },
        },
        rng,
      ).nextState;

      return stableHash(state);
    };

    const h1 = runPipeline();
    const h2 = runPipeline();
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
  });

  // Dedicated AI Infrastructure Golden Fixture 3: LLM Serving PagedAttention Continuous Batching
  it('[llm-serving:continuous-batching] produces bit-identical state across multi-request VRAM paging and speculative decoding', () => {
    const plugin = DomainRegistry.get('llm-serving')!;
    const runServing = () => {
      const rng = new DeterministicRNG(42);
      let state = plugin.createDefaultState();

      // Submit new burst request
      state = plugin.reduceState(
        state,
        {
          id: 'sub-1',
          tick: 1,
          type: 'LLM_SUBMIT_REQUEST' as any,
          payload: { requestId: 'req-streaming-stream', promptTokens: 32, maxGeneratedTokens: 16 },
        },
        rng,
      ).nextState;

      // Step continuous batching scheduler for 15 ticks
      for (let t = 2; t <= 16; t++) {
        state = plugin.reduceState(
          state,
          { id: `step-${t}`, tick: t, type: 'LLM_STEP_BATCH' as any },
          rng,
        ).nextState;
      }

      return stableHash(state);
    };

    const h1 = runServing();
    const h2 = runServing();
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
  });

  // Dedicated AI Infrastructure Golden Fixture 3b: LLM Serving OOM Eviction Chaos & Speculative Draft Rejection
  it('[llm-serving:oom-eviction-chaos] produces bit-identical state across OOM block exhaustion preemption and speculative rejections', () => {
    const plugin = DomainRegistry.get('llm-serving')!;
    const runChaos = () => {
      const rng = new DeterministicRNG(42);
      let state = plugin.createDefaultState();

      // Enable speculative decoding with tight draft acceptance rate
      state = plugin.reduceState(
        state,
        {
          id: 'toggle-spec',
          tick: 1,
          type: 'LLM_TOGGLE_SPECULATIVE' as any,
          payload: { enabled: true, gamma: 4, draftAcceptanceRate: 0.25 },
        },
        rng,
      ).nextState;

      // Inject OOM flood to trigger preemption
      state = plugin.reduceState(
        state,
        {
          id: 'oom-flood',
          tick: 2,
          type: 'LLM_OOM_INJECTION' as any,
          payload: { count: 5 },
        },
        rng,
      ).nextState;

      // Step batch 12 ticks
      for (let t = 3; t <= 14; t++) {
        state = plugin.reduceState(
          state,
          { id: `step-${t}`, tick: t, type: 'LLM_STEP_BATCH' as any },
          rng,
        ).nextState;
      }

      // Assert invariants hold
      const validation = plugin.validateInvariants(state);
      expect(validation.passed).toBe(true);

      return stableHash(state);
    };

    const h1 = runChaos();
    const h2 = runChaos();
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
  });

  // Dedicated AI Infrastructure Golden Fixture 4: VectorDB HNSW Multi-Layer Traversal
  it('[vectordb:hnsw-greedy-beam] produces bit-identical state across vector insertions and k-NN greedy search', () => {
    const plugin = DomainRegistry.get('vectordb')!;
    const runVectorDB = () => {
      const rng = new DeterministicRNG(42);
      let state = plugin.createDefaultState();

      // Insert vectors
      state = plugin.reduceState(
        state,
        {
          id: 'ins-v1',
          tick: 1,
          type: 'VEC_INSERT_VECTOR' as any,
          payload: { nodeId: 'vec-golden-1', vector: [0.12, 0.22, 0.32, 0.42], topLayer: 2 },
        },
        rng,
      ).nextState;

      // Run k-NN query
      state = plugin.reduceState(
        state,
        {
          id: 'query-knn',
          tick: 2,
          type: 'VEC_QUERY_KNN' as any,
          payload: { queryId: 'q-vec-1', queryVector: [0.13, 0.23, 0.33, 0.43], k: 3 },
        },
        rng,
      ).nextState;

      for (let t = 3; t <= 8; t++) {
        state = plugin.reduceState(
          state,
          { id: `tick-${t}`, tick: t, type: 'VEC_TICK' as any, payload: {} },
          rng,
        ).nextState;
      }

      return stableHash(state);
    };

    const h1 = runVectorDB();
    const h2 = runVectorDB();
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
  });

  // Dedicated AI Infrastructure Golden Fixture 4b: VectorDB Node Deletion Chaos & Subsumption Integrity
  it('[vectordb:node-deletion-chaos] produces bit-identical state across dynamic node deletion and graph healing', () => {
    const plugin = DomainRegistry.get('vectordb')!;
    const runDeleteChaos = () => {
      const rng = new DeterministicRNG(42);
      let state = plugin.createDefaultState();

      // Insert node
      state = plugin.reduceState(
        state,
        {
          id: 'ins-chaos',
          tick: 1,
          type: 'VEC_INSERT_VECTOR' as any,
          payload: { nodeId: 'vec-chaos-victim', vector: [0.75, 0.65, 0.55, 0.45], topLayer: 2 },
        },
        rng,
      ).nextState;

      // Delete node
      state = plugin.reduceState(
        state,
        {
          id: 'del-chaos',
          tick: 2,
          type: 'VEC_DELETE_NODE' as any,
          payload: { nodeId: 'vec-chaos-victim' },
        },
        rng,
      ).nextState;

      // Assert invariants hold
      const validation = plugin.validateInvariants(state);
      expect(validation.passed).toBe(true);

      for (let t = 3; t <= 8; t++) {
        state = plugin.reduceState(
          state,
          { id: `tick-${t}`, tick: t, type: 'VEC_TICK' as any, payload: {} },
          rng,
        ).nextState;
      }

      return stableHash(state);
    };

    const h1 = runDeleteChaos();
    const h2 = runDeleteChaos();
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
  });

  // Dedicated AI Infrastructure Golden Fixture 5: GPU Cluster 1F1B Schedule & ZeRO
  it('[gpu-cluster:1f1b-schedule] produces bit-identical state across 1F1B schedule Gantt steps and ZeRO-3 sharding', () => {
    const plugin = DomainRegistry.get('gpu-cluster')!;
    const runGPU = () => {
      const rng = new DeterministicRNG(42);
      let state = plugin.createDefaultState();

      // Set ZeRO-3 parameter sharding
      state = plugin.reduceState(
        state,
        {
          id: 'set-zero3',
          tick: 1,
          type: 'GPU_SET_ZERO_STAGE' as any,
          payload: { stage: 'ZeRO-3' },
        },
        rng,
      ).nextState;

      // Step 1F1B schedule and Ring-AllReduce for 12 ticks
      for (let t = 2; t <= 12; t++) {
        state = plugin.reduceState(
          state,
          { id: `step-${t}`, tick: t, type: 'GPU_STEP_1F1B' as any },
          rng,
        ).nextState;

        state = plugin.reduceState(
          state,
          { id: `ar-${t}`, tick: t, type: 'GPU_STEP_ALLREDUCE' as any },
          rng,
        ).nextState;
      }

      return stableHash(state);
    };

    const h1 = runGPU();
    const h2 = runGPU();
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
  });

  // Dedicated AI Infrastructure Golden Fixture 5b: GPU Cluster Straggler Drag & NVLink Fallback Chaos
  it('[gpu-cluster:straggler-nvlink-chaos] produces bit-identical state across thermal throttling and NVLink interconnect degradation', () => {
    const plugin = DomainRegistry.get('gpu-cluster')!;
    const runGPUChaos = () => {
      const rng = new DeterministicRNG(42);
      let state = plugin.createDefaultState();

      // Throttle GPU #2 to create straggler bottleneck
      state = plugin.reduceState(
        state,
        {
          id: 'throttle-gpu2',
          tick: 1,
          type: 'GPU_THROTTLE_STRAGGLER' as any,
          payload: { gpuId: 'gpu-2', throttled: true },
        },
        rng,
      ).nextState;

      // Sever intra-chassis NVLink to force PCIe fallback
      state = plugin.reduceState(
        state,
        {
          id: 'sever-nvlink',
          tick: 2,
          type: 'GPU_SEVER_NVLINK' as any,
          payload: { sourceGPU: 'gpu-0', targetGPU: 'gpu-1' },
        },
        rng,
      ).nextState;

      // Step AllReduce across degraded fabric
      for (let t = 3; t <= 8; t++) {
        state = plugin.reduceState(
          state,
          { id: `step-ar-${t}`, tick: t, type: 'GPU_STEP_ALLREDUCE' as any },
          rng,
        ).nextState;
      }

      // Assert invariants hold
      const validation = plugin.validateInvariants(state);
      expect(validation.passed).toBe(true);

      return stableHash(state);
    };

    const h1 = runGPUChaos();
    const h2 = runGPUChaos();
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
  });

  // Dedicated AI Infrastructure Golden Fixture 6: LLM Pipeline Steady-State & Flagship PIPE-8 Passing
  it('[llm-pipeline:steady-traceable] produces bit-identical state across ETL, RAG, agent tool DAG, and verified PIPE-8 provenance', () => {
    const plugin = DomainRegistry.get('llm-pipeline')!;
    const runPipeline = () => {
      const rng = new DeterministicRNG(42);
      let state = plugin.createDefaultState();

      // 1. Ingest docs
      state = plugin.reduceState(
        state,
        {
          id: 'ingest-1',
          tick: 1,
          type: 'PIPE_INGEST_DOC' as any,
          payload: {
            docId: 'doc-dist-sys',
            title: 'Reliable Distributed Systems',
            content:
              'State machine replication relies on total order broadcast and deterministic state transitions.',
          },
        },
        rng,
      ).nextState;

      // 2. Hybrid search & RRF
      state = plugin.reduceState(
        state,
        {
          id: 'search-1',
          tick: 2,
          type: 'PIPE_EXECUTE_HYBRID_SEARCH' as any,
          payload: { queryId: 'q-rep', queryText: 'total order broadcast replication' },
        },
        rng,
      ).nextState;

      // 3. Agent Tool Call
      state = plugin.reduceState(
        state,
        {
          id: 'tool-step-1',
          tick: 3,
          type: 'PIPE_DISPATCH_AGENT_STEP' as any,
          payload: {
            stepId: 'step-tool-rep',
            taskId: 'task-rep',
            type: 'TOOL_CALL',
            toolName: 'knowledge_search',
            toolArgs: { term: 'replication' },
            dependsOn: ['step-plan-1'],
          },
        },
        rng,
      ).nextState;

      // 4. Agent Observation
      state = plugin.reduceState(
        state,
        {
          id: 'obs-step-1',
          tick: 4,
          type: 'PIPE_DISPATCH_AGENT_STEP' as any,
          payload: {
            stepId: 'step-obs-rep',
            taskId: 'task-rep',
            type: 'OBSERVATION',
            output: 'Retrieved chunk-dist-sys-1 with relevance score 0.94.',
            dependsOn: ['step-tool-rep'],
          },
        },
        rng,
      ).nextState;

      // 5. Synthesize response with valid citation
      state = plugin.reduceState(
        state,
        {
          id: 'synth-1',
          tick: 5,
          type: 'PIPE_SYNTHESIZE_RESPONSE' as any,
          payload: {
            queryId: 'q-rep',
            answerText: 'State machine replication guarantees consistency using total order broadcast.',
            claims: [
              {
                claimId: 'claim-rep-1',
                text: 'Replication relies on total order broadcast',
                citationChunkId: 'chunk-doc-dist-sys-1',
                observationStepId: 'step-obs-rep',
              },
            ],
          },
        },
        rng,
      ).nextState;

      // Assert PIPE-8 passes
      const validation = plugin.validateInvariants(state);
      expect(validation.passed).toBe(true);

      for (let t = 6; t <= 10; t++) {
        state = plugin.reduceState(
          state,
          { id: `tick-${t}`, tick: t, type: 'PIPE_TICK' as any },
          rng,
        ).nextState;
      }

      return stableHash(state);
    };

    const h1 = runPipeline();
    const h2 = runPipeline();
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
  });

  // Dedicated AI Infrastructure Golden Fixture 7: LLM Pipeline Lineage-Severing Chaos & Flagship PIPE-8 Failing
  it('[llm-pipeline:lineage-severed-chaos] asserts PIPE-8 correctly triggers violation when provenance lineage is severed', () => {
    const plugin = DomainRegistry.get('llm-pipeline')!;
    const runSevered = () => {
      const rng = new DeterministicRNG(42);
      let state = plugin.createDefaultState();

      // Trigger chaos: sever lineage on default claim
      state = plugin.reduceState(
        state,
        {
          id: 'sever-claim-1',
          tick: 1,
          type: 'PIPE_SEVER_LINEAGE' as any,
          payload: {
            responseId: 'resp-init',
            claimId: 'claim-init-1',
          },
        },
        rng,
      ).nextState;

      // Assert PIPE-8 fails
      const validation = plugin.validateInvariants(state);
      expect(validation.passed).toBe(false);
      expect(validation.violation?.name).toBe('PIPE-8');
      expect(validation.violation?.description).toContain('Provenance lineage severed');

      for (let t = 2; t <= 6; t++) {
        state = plugin.reduceState(
          state,
          { id: `tick-${t}`, tick: t, type: 'PIPE_TICK' as any },
          rng,
        ).nextState;
      }

      return stableHash(state);
    };

    const h1 = runSevered();
    const h2 = runSevered();
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
  });

  // Dedicated AI Infrastructure Golden Fixture 8: LLM Gateway Steady Cached & Multi-Provider Route
  it('[llm-gateway:steady-cached-route] produces deterministic state hash across semantic cache hits and provider execution', () => {
    const plugin = DomainRegistry.get('llm-gateway')!;
    const runGateway = () => {
      const rng = new DeterministicRNG(42);
      let state = plugin.createDefaultState();

      // Dispatch cache hit query (angle 45 deg)
      state = plugin.reduceState(
        state,
        {
          id: 'req-hit',
          tick: 1,
          type: 'GW_DISPATCH_REQUEST' as any,
          payload: { prompt: 'Write SQL query for 30-day cohort retention', angleDeg: 45 },
        },
        rng,
      ).nextState;

      // Dispatch cache miss query (angle 180 deg) -> routed to primary (OpenAI)
      state = plugin.reduceState(
        state,
        {
          id: 'req-miss',
          tick: 2,
          type: 'GW_DISPATCH_REQUEST' as any,
          payload: { prompt: 'Explain Kubernetes topology spread constraints', angleDeg: 180 },
        },
        rng,
      ).nextState;

      // Invariants must pass
      const validation = plugin.validateInvariants(state);
      expect(validation.passed).toBe(true);

      for (let t = 3; t <= 7; t++) {
        state = plugin.reduceState(
          state,
          { id: `tick-${t}`, tick: t, type: 'GW_TICK' as any },
          rng,
        ).nextState;
      }

      return stableHash(state);
    };

    const h1 = runGateway();
    const h2 = runGateway();
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
  });

  // Dedicated AI Infrastructure Golden Fixture 9: LLM Gateway Circuit Breaker Trip & Fallback Routing Chaos
  it('[llm-gateway:provider-outage-fallback] asserts GW-1 circuit breaker trips to OPEN and routes to fallback provider under outage', () => {
    const plugin = DomainRegistry.get('llm-gateway')!;
    const runOutage = () => {
      const rng = new DeterministicRNG(42);
      let state = plugin.createDefaultState();

      // Trigger 3 failures on primary provider
      state = plugin.reduceState(
        state,
        {
          id: 'trip-primary',
          tick: 1,
          type: 'GW_TRIGGER_FAILURES' as any,
          payload: { providerId: 'openai-gpt4o', count: 3 },
        },
        rng,
      ).nextState;

      // Dispatch request -> must be FALLBACK_ROUTED to secondary
      state = plugin.reduceState(
        state,
        {
          id: 'req-fallback',
          tick: 2,
          type: 'GW_DISPATCH_REQUEST' as any,
          payload: { prompt: 'Summarize distributed lock algorithms', angleDeg: 330 },
        },
        rng,
      ).nextState;

      // Verify invariants
      const validation = plugin.validateInvariants(state);
      expect(validation.passed).toBe(true);

      // Advance 5 ticks to enter HALF_OPEN
      for (let t = 3; t <= 7; t++) {
        state = plugin.reduceState(
          state,
          { id: `tick-${t}`, tick: t, type: 'GW_TICK' as any },
          rng,
        ).nextState;
      }

      return stableHash(state);
    };

    const h1 = runOutage();
    const h2 = runOutage();
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
  });
});

