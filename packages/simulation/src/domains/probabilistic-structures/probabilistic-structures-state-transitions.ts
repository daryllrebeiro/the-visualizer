import type { DeterministicRNG } from '../../prng/deterministic-rng.js';
import {
  bloomInsert,
  bloomLookup,
  countingBloomDelete,
  countingBloomInsert,
  countingBloomLookup,
  cuckooDelete,
  cuckooInsert,
  cuckooLookup,
  cmsEstimate,
  cmsInsert,
  hllEstimate,
  hllInsert,
} from './probabilistic-structures-algorithms.js';
import {
  PROB_CAPS,
  type CountingBloomFilterState,
  type CuckooFilterState,
  type HyperLogLogState,
  type ProbabilisticOpRecord,
  type ProbabilisticStructuresClusterState,
  type ProbabilisticStructuresSimEvent,
} from './probabilistic-structures-types.js';

const DEFAULT_BLOOM_M = 8192;
const DEFAULT_BLOOM_K = 7;
const DEFAULT_HLL_M = 1024;
const DEFAULT_CUCKOO_BUCKETS = 512;
const DEFAULT_CUCKOO_SLOTS = 4;
const DEFAULT_CMS_ROWS = 4;
const DEFAULT_CMS_WIDTH = 2048;

function createBloom(m: number, k: number) {
  return { m, k, bits: new Array<number>(m).fill(0) };
}

function createCountingBloom(m: number, k: number): CountingBloomFilterState {
  return { m, k, counters: new Array<number>(m).fill(0) };
}

function createCuckoo(buckets: number, slots: number): CuckooFilterState {
  return {
    bucketsCount: buckets,
    slotsPerBucket: slots,
    buckets: Array.from({ length: buckets }, () => new Array<number>(slots).fill(0)),
    kickLog: [],
    rejectedInserts: 0,
  };
}

function createHll(m: number): HyperLogLogState {
  return { m, registers: new Array<number>(m).fill(0) };
}

function createCms(rows: number, width: number) {
  return {
    rows,
    width,
    counters: Array.from({ length: rows }, () => new Array<number>(width).fill(0)),
  };
}

export function createDefaultProbabilisticStructuresCluster(
  clusterId = 'probabilistic-structures-1',
): ProbabilisticStructuresClusterState {
  return {
    clusterId,
    tick: 0,
    bloom: createBloom(DEFAULT_BLOOM_M, DEFAULT_BLOOM_K),
    countingBloom: createCountingBloom(DEFAULT_BLOOM_M, DEFAULT_BLOOM_K),
    cuckoo: createCuckoo(DEFAULT_CUCKOO_BUCKETS, DEFAULT_CUCKOO_SLOTS),
    hll: createHll(DEFAULT_HLL_M),
    cms: createCms(DEFAULT_CMS_ROWS, DEFAULT_CMS_WIDTH),
    streamCounts: {},
    deleteCounts: {},
    cuckooRejected: {},
    distinctInserted: 0,
    recentOps: [],
    stats: {
      bloomTruePositives: 0,
      bloomFalsePositives: 0,
      bloomLookupNegatives: 0,
      countingBloomDeletions: 0,
      cuckooDeletions: 0,
      cuckooKicks: 0,
      bloomDeletesAttempted: 0,
    },
    lastOp: null,
  };
}

function isPresent(state: ProbabilisticStructuresClusterState, element: string): boolean {
  return (state.streamCounts[element] ?? 0) - (state.deleteCounts[element] ?? 0) > 0;
}

function pushOp(state: ProbabilisticStructuresClusterState, op: ProbabilisticOpRecord): void {
  state.recentOps.push(op);
  if (state.recentOps.length > PROB_CAPS.maxRecentOps) {
    state.recentOps.shift();
  }
  state.lastOp = op;
}

export function pureProbabilisticStructuresTransition(
  state: ProbabilisticStructuresClusterState,
  event: ProbabilisticStructuresSimEvent,
  rng: DeterministicRNG,
): { nextState: ProbabilisticStructuresClusterState; emittedEvents: ProbabilisticStructuresSimEvent[] } {
  const nextState: ProbabilisticStructuresClusterState = JSON.parse(
    JSON.stringify(state),
  ) as ProbabilisticStructuresClusterState;
  nextState.tick = event.tick;

  switch (event.type) {
    case 'PROB_INSERT_BATCH': {
      for (const element of event.payload.elements.slice(0, PROB_CAPS.maxBatchSize)) {
        if (nextState.distinctInserted >= PROB_CAPS.maxStreamElements) break;

        bloomInsert(nextState.bloom, element);
        countingBloomInsert(nextState.countingBloom, element);
        const kicksBefore = nextState.cuckoo.kickLog.length;
        const cuckooResult = cuckooInsert(
          nextState.cuckoo,
          element,
          () => rng.nextInt(0, 3),
          PROB_CAPS.maxCuckooKicks,
        );
        nextState.stats.cuckooKicks += nextState.cuckoo.kickLog.length - kicksBefore;
        if (!cuckooResult.inserted) {
          nextState.cuckooRejected[element] = (nextState.cuckooRejected[element] ?? 0) + 1;
        }
        hllInsert(nextState.hll, element);
        cmsInsert(nextState.cms, element);

        if ((nextState.streamCounts[element] ?? 0) === 0) {
          nextState.distinctInserted++;
        }
        nextState.streamCounts[element] = (nextState.streamCounts[element] ?? 0) + 1;

        pushOp(nextState, {
          op: 'INSERT',
          element,
          tick: event.tick,
          note:
            !cuckooResult.inserted
              ? 'cuckoo filter full — insert rejected (surfaced)'
              : undefined,
        });
      }
      break;
    }

    case 'PROB_DELETE': {
      const element = event.payload.element;

      // Standard Bloom: deletion unsupported (bit-clearing would break
      // PROB-1 for colliding elements — the classic hazard).
      nextState.stats.bloomDeletesAttempted++;

      const countingOk = countingBloomDelete(nextState.countingBloom, element);
      if (countingOk) {
        nextState.stats.countingBloomDeletions++;
      }

      const cuckooOk = cuckooDelete(nextState.cuckoo, element);
      if (cuckooOk) {
        nextState.stats.cuckooDeletions++;
      }

      if (countingOk || cuckooOk) {
        nextState.deleteCounts[element] = (nextState.deleteCounts[element] ?? 0) + 1;
      }

      pushOp(nextState, {
        op: 'DELETE',
        element,
        tick: event.tick,
        bloom: bloomLookup(nextState.bloom, element),
        countingBloom: countingBloomLookup(nextState.countingBloom, element),
        cuckoo: cuckooLookup(nextState.cuckoo, element),
        note: countingOk || cuckooOk ? undefined : 'delete on absent element rejected',
      });
      break;
    }

    case 'PROB_LOOKUP': {
      const element = event.payload.element;
      const bloomHit = bloomLookup(nextState.bloom, element);
      const countingHit = countingBloomLookup(nextState.countingBloom, element);
      const cuckooHit = cuckooLookup(nextState.cuckoo, element);
      const present = isPresent(nextState, element);

      if (bloomHit) {
        if (present) {
          nextState.stats.bloomTruePositives++;
        } else {
          nextState.stats.bloomFalsePositives++;
        }
      } else {
        nextState.stats.bloomLookupNegatives++;
      }

      pushOp(nextState, {
        op: 'LOOKUP',
        element,
        tick: event.tick,
        bloom: bloomHit,
        countingBloom: countingHit,
        cuckoo: cuckooHit,
        hllEstimate: hllEstimate(nextState.hll),
        cmsEstimate: cmsEstimate(nextState.cms, element),
      });
      break;
    }

    case 'PROB_SET_BLOOM_PARAMS': {
      const m = event.payload.m
        ? Math.max(16, Math.min(PROB_CAPS.maxBloomM, event.payload.m))
        : nextState.bloom.m;
      const k = event.payload.k
        ? Math.max(1, Math.min(PROB_CAPS.maxBloomK, event.payload.k))
        : nextState.bloom.k;
      // Parameter changes rebuild empty structures (documented reset
      // semantics — a mid-stream rebuild would silently drop elements).
      nextState.bloom = createBloom(m, k);
      nextState.countingBloom = createCountingBloom(m, k);
      nextState.streamCounts = {};
      nextState.deleteCounts = {};
      nextState.cuckooRejected = {};
      nextState.distinctInserted = 0;
      pushOp(nextState, {
        op: 'LOOKUP',
        element: '__config_reset__',
        tick: event.tick,
        note: `bloom params reset to m=${m} k=${k}; stream cleared`,
      });
      break;
    }

    case 'PROB_SET_HLL_M': {
      let m = Math.max(16, Math.min(PROB_CAPS.maxHllM, event.payload.m));
      // Registers must be a power of two for the index mask.
      m = 1 << Math.round(Math.log2(m));
      nextState.hll = createHll(m);
      pushOp(nextState, {
        op: 'LOOKUP',
        element: '__config_reset__',
        tick: event.tick,
        note: `HLL m reset to ${m}; registers cleared`,
      });
      break;
    }

    case 'TICK' as any:
    case 'PROB_TICK': {
      break;
    }
  }

  nextState.rngState = rng.getState();
  return { nextState, emittedEvents: [] };
}
