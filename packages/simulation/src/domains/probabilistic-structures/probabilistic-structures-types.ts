/**
 * Bloom Filters & Probabilistic Data Structures — simulation types.
 *
 * Comparative deep-dive of five structures fed an identical stream:
 *   1. Standard Bloom filter (Bloom 1970)
 *   2. Counting Bloom filter (Fan et al. 2000, Summary Cache)
 *   3. Cuckoo filter (Fan et al., CoNEXT '14)
 *   4. HyperLogLog (Flajolet et al. 2007)
 *   5. Count-Min Sketch (Cormode & Muthukrishnan 2005)
 *
 * References:
 * - Bloom (1970): Space/Time Trade-offs in Hash Coding with Allowable Errors
 * - Fan, Cao, Almeida, Broder (2000): Summary Cache: The Scalability of
 *   Caching in the World Wide Web (counting Bloom)
 * - Fan, Andersen, Kaminsky (2014): Cuckoo Filter: Practively Better Than
 *   Bloom (CoNEXT '14)
 * - Flajolet, Fusy, Gandouet, Meunier (2007): HyperLogLog: The analysis of
 *   a near-optimal cardinality estimation algorithm — standard error
 *   1.04/sqrt(m), m = register count
 * - Cormode & Muthukrishnan (2005): An Improved Data Stream Summary: The
 *   Count-Min Sketch and its Applications
 */

export interface BloomFilterState {
  /** bit-array size m (power-of-two friendly, capped at 16384) */
  m: number;
  /** number of hash functions k */
  k: number;
  /** bits stored as 0/1 numbers (deterministic JSON) */
  bits: number[];
}

export interface CountingBloomFilterState {
  m: number;
  k: number;
  /** 4-bit counters, each in [0, 15] */
  counters: number[];
}

export interface CuckooFilterState {
  bucketsCount: number;
  slotsPerBucket: number;
  /** fingerprints per bucket (12-bit values, 0 = empty slot) */
  buckets: number[][];  /** recent kick path: [bucket, slot, fingerprint] triples */
  kickLog: Array<{ fromBucket: number; toBucket: number; fingerprint: number }>;
  /** count of rejected inserts due to max kicks — surfaced, never silent */
  rejectedInserts: number;
}

export interface HyperLogLogState {
  /** register count m (power of two) */
  m: number;
  /** each register: max leading-zero count + 1 over its stream members */
  registers: number[];
}

export interface CountMinSketchState {
  rows: number;
  width: number;
  /** counters[row][column], saturating 16-bit */
  counters: number[][];
}

export type ProbabilisticStructureId =
  | 'BLOOM'
  | 'COUNTING_BLOOM'
  | 'CUCKOO'
  | 'HYPERLOGLOG'
  | 'COUNT_MIN_SKETCH';

export interface ProbabilisticOpRecord {
  op: 'INSERT' | 'DELETE' | 'LOOKUP';
  element: string;
  tick: number;
  bloom?: boolean | undefined;
  countingBloom?: boolean | undefined;
  cuckoo?: boolean | undefined;
  hllEstimate?: number | undefined;
  cmsEstimate?: number | undefined;
  note?: string | undefined;
}

export interface ProbabilisticStructuresClusterState {
  clusterId: string;
  tick: number;
  rngState?: number;
  bloom: BloomFilterState;
  countingBloom: CountingBloomFilterState;
  cuckoo: CuckooFilterState;
  hll: HyperLogLogState;
  cms: CountMinSketchState;
  /** full insertion stream with multiplicity (PROB-4 ground truth) */
  streamCounts: Record<string, number>;
  /** deletion stream with multiplicity */
  deleteCounts: Record<string, number>;
  distinctInserted: number;
  /**
   * Elements the cuckoo filter rejected due to overflow (surfaced, never
   * silent). Tracked separately so PROB-1's cuckoo check only applies to
   * elements the filter actually accepted.
   */
  cuckooRejected: Record<string, number>;
  /** capped recent operation log */
  recentOps: ProbabilisticOpRecord[];
  stats: {
    bloomTruePositives: number;
    bloomFalsePositives: number;
    bloomLookupNegatives: number;
    countingBloomDeletions: number;
    cuckooDeletions: number;
    cuckooKicks: number;
    bloomDeletesAttempted: number;
  };
  lastOp: ProbabilisticOpRecord | null;
}

export type ProbabilisticStructuresSimEvent =
  | {
      id: string;
      tick: number;
      type: 'PROB_TICK';
      payload: Record<string, unknown>;
    }
  | {
      id: string;
      tick: number;
      type: 'PROB_INSERT_BATCH';
      payload: { elements: string[] };
    }
  | {
      id: string;
      tick: number;
      type: 'PROB_DELETE';
      payload: { element: string };
    }
  | {
      id: string;
      tick: number;
      type: 'PROB_LOOKUP';
      payload: { element: string };
    }
  | {
      id: string;
      tick: number;
      type: 'PROB_SET_BLOOM_PARAMS';
      payload: { m?: number; k?: number };
    }
  | {
      id: string;
      tick: number;
      type: 'PROB_SET_HLL_M';
      payload: { m: number };
    };

/** Resource caps (hard-clamped; surfaced in UI when hit). */
export const PROB_CAPS = {
  maxBloomM: 16_384,
  maxBloomK: 16,
  maxCountingCounter: 15,
  maxCuckooBuckets: 512,
  maxCuckooSlots: 4,
  maxCuckooFingerprint: 4095, // 12-bit fingerprints
  maxCuckooKicks: 32,
  maxHllM: 16_384,
  maxCmsRows: 5,
  maxCmsWidth: 4_096,
  maxCmsCounter: 65_535,
  maxStreamElements: 20_000,
  maxBatchSize: 1_000,
  maxRecentOps: 200,
} as const;
