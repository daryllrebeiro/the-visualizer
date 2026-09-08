/**
 * Probabilistic data structure algorithms — pure, integer-first.
 *
 * Hash primitive: fnv1a32 (avalanche-mixed) from the consistent-hashing
 * shared core. Bloom uses the Kirsch-Mitzenmacher double-hashing scheme
 * (h_i = h1 + i*h2) to derive k positions from two base hashes.
 * HyperLogLog's single ln() is quantized at the reducer boundary.
 */

import { fnv1a32 } from '../consistent-hashing/consistent-hashing-algorithms.js';
import type {
  BloomFilterState,
  CountingBloomFilterState,
  CountMinSketchState,
  CuckooFilterState,
  HyperLogLogState,
} from './probabilistic-structures-types.js';

const PROB_SEEDS = {
  bloomH1: 0x811c9dc5,
  bloomH2: 0x9747b28c,
  cmsRow: [0x5bf03635, 0x27d4eb2f, 0x165667b1, 0x9e3779b9, 0x85ebca6b],
  hllIndex: 0x5bf03635,
  hllValue: 0x27d4eb2f,
  cuckooBucket: 0x811c9dc5,
  cuckooFingerprint: 0x9747b28c,
  cuckooAlt: 0x165667b1,
} as const;

/** Kirsch-Mitzenmacher: k positions from two base hashes. */
export function bloomPositions(element: string, m: number, k: number): number[] {
  const h1 = fnv1a32(`${element}::h1`, PROB_SEEDS.bloomH1);
  // |1 forces an odd (2^13-coprime) stride; >>>0 un-wraps the signed
  // int32 the bitwise OR produces — without it, negative h2 yields
  // negative positions that JSON round-trips silently drop.
  const h2 = (fnv1a32(`${element}::h2`, PROB_SEEDS.bloomH2) | 1) >>> 0;
  const positions: number[] = [];
  for (let i = 0; i < k; i++) {
    positions.push((h1 + i * h2) % m);
  }
  return positions;
}

export function bloomInsert(bloom: BloomFilterState, element: string): BloomFilterState {
  for (const p of bloomPositions(element, bloom.m, bloom.k)) {
    bloom.bits[p] = 1;
  }
  return bloom;
}

export function bloomLookup(bloom: Readonly<BloomFilterState>, element: string): boolean {
  return bloomPositions(element, bloom.m, bloom.k).every((p) => bloom.bits[p] === 1);
}

/** Theoretical false-positive rate: (1 - e^(-kn/m))^k (Bloom 1970). */
export function bloomTheoreticalFpRate(m: number, k: number, n: number): number {
  if (n === 0) return 0;
  const pow = -((k * n) / m);
  return Math.pow(1 - Math.exp(pow), k);
}

export function countingBloomInsert(cb: CountingBloomFilterState, element: string): CountingBloomFilterState {
  for (const p of bloomPositions(element, cb.m, cb.k)) {
    cb.counters[p] = Math.min(15, cb.counters[p]! + 1);
  }
  return cb;
}

export function countingBloomLookup(cb: Readonly<CountingBloomFilterState>, element: string): boolean {
  return bloomPositions(element, cb.m, cb.k).every((p) => (cb.counters[p] ?? 0) > 0);
}

/**
 * Counting Bloom deletion. Returns false (and does not mutate) when the
 * element is not present — the counter-underflow guard that keeps PROB-2
 * safe for still-present colliding neighbors.
 */
export function countingBloomDelete(cb: CountingBloomFilterState, element: string): boolean {
  const positions = bloomPositions(element, cb.m, cb.k);
  if (!positions.every((p) => (cb.counters[p] ?? 0) > 0)) {
    return false;
  }
  for (const p of positions) {
    cb.counters[p] = Math.max(0, cb.counters[p]! - 1);
  }
  return true;
}

// ── Cuckoo filter ──────────────────────────────────────────────────────────

export function cuckooFingerprint(element: string): number {
  // 12-bit fingerprint; forced non-zero (0 = empty slot sentinel).
  return Math.max(1, fnv1a32(`${element}::fp`, PROB_SEEDS.cuckooFingerprint) & 0xfff);
}

export function cuckooBuckets(element: string, fingerprint: number, bucketsCount: number): [number, number] {
  const i1 = fnv1a32(`${element}::b`, PROB_SEEDS.cuckooBucket) % bucketsCount;
  const i2 = cuckooAlternateBucket(i1, fingerprint, bucketsCount);
  return [i1, i2];
}

/** i2 = i1 XOR hash(fingerprint) (Fan et al. CoNEXT '14, eq. 1). */
export function cuckooAlternateBucket(i1: number, fingerprint: number, bucketsCount: number): number {
  const h = fnv1a32(`fp:${fingerprint}`, PROB_SEEDS.cuckooAlt) % bucketsCount;
  return (i1 ^ h) % bucketsCount;
}

export function cuckooLookup(cuckoo: Readonly<CuckooFilterState>, element: string): boolean {
  const fp = cuckooFingerprint(element);
  const [i1, i2] = cuckooBuckets(element, fp, cuckoo.bucketsCount);
  return (
    cuckoo.buckets[i1]!.includes(fp) || cuckoo.buckets[i2]!.includes(fp)
  );
}

export interface CuckooInsertResult {
  state: CuckooFilterState;
  inserted: boolean;
}

/**
 * Cuckoo insert with deterministic victim selection and full chain
 * rollback on failure. On kick-budget exhaustion every stored element
 * is restored to its original slot and ONLY the new element is
 * rejected — a naive "drop the in-flight fingerprint" loop would
 * silently evict a previously-stored element (a false negative).
 */
export function cuckooInsert(
  cuckoo: CuckooFilterState,
  element: string,
  pickVictimSlot: () => number,
  maxKicks: number,
): CuckooInsertResult {
  const fp = cuckooFingerprint(element);
  const [i1, i2] = cuckooBuckets(element, fp, cuckoo.bucketsCount);

  for (const b of [i1, i2]) {
    const bucket = cuckoo.buckets[b]!;
    const free = bucket.indexOf(0);
    if (free >= 0) {
      bucket[free] = fp;
      return { state: cuckoo, inserted: true };
    }
  }

  // Both candidate buckets full: kick chain.
  const chain: Array<{ bucket: number; slot: number; victimFp: number }> = [];
  let bucketIdx = i1;
  let currentFp = fp;
  for (let kick = 0; kick < maxKicks; kick++) {
    const bucket = cuckoo.buckets[bucketIdx]!;
    const slot = pickVictimSlot() % bucket.length;
    const victimFp = bucket[slot]!;
    bucket[slot] = currentFp;
    chain.push({ bucket: bucketIdx, slot, victimFp });

    const target = cuckooAlternateBucket(bucketIdx, victimFp, cuckoo.bucketsCount);
    const targetBucket = cuckoo.buckets[target]!;
    const freeSlot = targetBucket.indexOf(0);
    if (freeSlot >= 0) {
      targetBucket[freeSlot] = victimFp;
      cuckoo.kickLog.push({ fromBucket: bucketIdx, toBucket: target, fingerprint: victimFp });
      if (cuckoo.kickLog.length > 64) {
        cuckoo.kickLog.shift();
      }
      return { state: cuckoo, inserted: true };
    }
    // Continue with the displaced victim.
    bucketIdx = target;
    currentFp = victimFp;
  }

  // Kick budget exhausted: roll back the whole chain so no stored
  // element is lost; reject only the new element (surfaced, not silent).
  for (let i = chain.length - 1; i >= 0; i--) {
    const step = chain[i]!;
    cuckoo.buckets[step.bucket]![step.slot] = step.victimFp;
  }
  cuckoo.rejectedInserts++;
  return { state: cuckoo, inserted: false };
}

export function cuckooDelete(cuckoo: CuckooFilterState, element: string): boolean {
  const fp = cuckooFingerprint(element);
  const [i1, i2] = cuckooBuckets(element, fp, cuckoo.bucketsCount);
  for (const b of [i1, i2]) {
    const bucket = cuckoo.buckets[b]!;
    const slot = bucket.indexOf(fp);
    if (slot >= 0) {
      bucket[slot] = 0;
      return true;
    }
  }
  return false;
}

// ── HyperLogLog ────────────────────────────────────────────────────────────

export function hllIndexAndZeros(element: string, m: number): { index: number; zeros: number } {
  // Index from one 32-bit hash stream, run-of-zeros from an independent
  // 32-bit stream (documented simplification of the 64-bit original:
  // index and value bits are independent uniform draws either way).
  const index = fnv1a32(`${element}::idx`, PROB_SEEDS.hllIndex) & (m - 1);
  const value = fnv1a32(`${element}::val`, PROB_SEEDS.hllValue);
  // HLL register value: position of the leftmost 1-bit counted from the
  // MSB (1-indexed) = clz32(value) + 1. For value === 0 the whole word
  // is zeros -> 33 (clz32(0) = 32).
  const zeros = value === 0 ? 33 : Math.clz32(value) + 1;
  return { index, zeros };
}

export function hllInsert(hll: HyperLogLogState, element: string): HyperLogLogState {
  const { index, zeros } = hllIndexAndZeros(element, hll.m);
  if (zeros > hll.registers[index]!) {
    hll.registers[index] = zeros;
  }
  return hll;
}

/** Flajolet alpha constants. */
function hllAlpha(m: number): number {
  if (m === 16) return 0.673;
  if (m === 32) return 0.697;
  if (m === 64) return 0.709;
  return 0.7213 / (1 + 1.079 / m);
}

/**
 * HyperLogLog cardinality estimate with Flajolet bias correction:
 * linear counting when raw <= 2.5m and empty registers exist; 32-bit
 * large-range correction above 2^32/30 (unreachable at our caps, kept
 * for fidelity). Output quantized per platform float-safety rule.
 */
export function hllEstimate(hll: Readonly<HyperLogLogState>): number {
  const m = hll.m;
  const alpha = hllAlpha(m);
  let sum = 0;
  let zeroRegisters = 0;
  for (const r of hll.registers) {
    sum += Math.pow(2, -r);
    if (r === 0) zeroRegisters++;
  }
  let raw = alpha * m * m * Math.pow(sum, -1);
  if (raw <= 2.5 * m && zeroRegisters > 0) {
    raw = m * Math.log(m / zeroRegisters); // linear counting
  } else if (raw > 4_294_967_296 / 30) {
    raw = -4_294_967_296 * Math.log(1 - raw / 4_294_967_296);
  }
  return Math.round(raw * 1e6) / 1e6;
}

/** Documented standard error: 1.04 / sqrt(m) (Flajolet et al. 2007). */
export function hllStandardError(m: number): number {
  return 1.04 / Math.sqrt(m);
}

// ── Count-Min Sketch ───────────────────────────────────────────────────────

export function cmsColumns(element: string, rows: number, width: number): number[] {
  const cols: number[] = [];
  for (let r = 0; r < rows; r++) {
    cols.push(fnv1a32(`${element}::row${r}`, PROB_SEEDS.cmsRow[r % PROB_SEEDS.cmsRow.length]!) % width);
  }
  return cols;
}

export function cmsInsert(cms: CountMinSketchState, element: string): CountMinSketchState {
  const cols = cmsColumns(element, cms.rows, cms.width);
  for (let r = 0; r < cms.rows; r++) {
    const row = cms.counters[r]!;
    const c = cols[r]!;
    row[c] = Math.min(65_535, (row[c] ?? 0) + 1);
  }
  return cms;
}

/** estimate = min over rows — one-sided error: only ever overestimates. */
export function cmsEstimate(cms: Readonly<CountMinSketchState>, element: string): number {
  const cols = cmsColumns(element, cms.rows, cms.width);
  let est = Infinity;
  for (let r = 0; r < cms.rows; r++) {
    est = Math.min(est, cms.counters[r]![cols[r]!] ?? 0);
  }
  return est;
}

/** Memory usage in bits, for the cross-structure comparison table. */
export function memoryBits(structure: 'BLOOM' | 'COUNTING_BLOOM' | 'CUCKOO' | 'HYPERLOGLOG' | 'COUNT_MIN_SKETCH', state: { bloom: BloomFilterState; countingBloom: CountingBloomFilterState; cuckoo: CuckooFilterState; hll: HyperLogLogState; cms: CountMinSketchState }): number {
  switch (structure) {
    case 'BLOOM':
      return state.bloom.m;
    case 'COUNTING_BLOOM':
      return state.countingBloom.m * 4;
    case 'CUCKOO':
      return state.cuckoo.bucketsCount * state.cuckoo.slotsPerBucket * 12;
    case 'HYPERLOGLOG':
      // registers hold values in [0, 33] -> 6 bits each
      return state.hll.m * 6;
    case 'COUNT_MIN_SKETCH':
      return state.cms.rows * state.cms.width * 16;
  }
}
