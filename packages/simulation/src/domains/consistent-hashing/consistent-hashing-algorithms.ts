/**
 * Consistent Hashing Algorithms — pure, deterministic implementations.
 *
 * All hash primitives are integer-only (FNV-1a 32-bit with distinct seeds,
 * Math.imul/>>> for 64-bit LCG steps) so assignments are bit-stable across
 * platforms. Jump Hash's single division is IEEE-754 double division,
 * which ECMAScript specifies exactly (unlike Math.log / Math.pow).
 */

/**
 * FNV-1a 32-bit string hash with a seed offset, finalized with an
 * avalanche mix (FNV-1a alone has weak diffusion for structured keys —
 * without the mix, ring positions and key hashes cluster and CHASH-2
 * load balance fails). Pure, integer-only.
 */
export function fnv1a32(input: string, seed = 0x811c9dc5): number {
  let hash = seed | 0;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  // 32-bit finalizer (xor-shift multiply avalanche, xxhash-style).
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

/** Seed variants so different uses get independent hash streams. */
export const HASH_SEEDS = {
  keyHash: 0x811c9dc5,
  vnodePosition: 0x9747b28c,
  hrwPair: 0x5bf03635,
} as const;

/** Ring key hash: uint32 position on the 2^32 ring. */
export function keyHash32(key: string): number {
  return fnv1a32(key, HASH_SEEDS.keyHash);
}

/**
 * Jump Consistent Hash — Lamping & Veach (2014), arXiv:1406.2294.
 *
 * Reference recurrence (translated to 64-bit BigInt arithmetic):
 *   b = -1; j = 0
 *   while (j < numBuckets) {
 *     b = j
 *     key = key * 2862933555777941757 + 1  (mod 2^64)
 *     j = (b + 1) * ((double)(1 << 31) / (double)((key >> 33) + 1))
 *   }
 *   return b
 *
 * BigInt ops are spec-exact integers; the single division is IEEE-754
 * exact. Growth-only by construction: growing n -> n+1 only ever reassigns
 * keys to bucket n (CHASH-3).
 */
export function jumpHash(key: bigint, numBuckets: number, iterations?: { count: number }): number {
  const LCG_MULT = 2862933555777941757n;
  const MOD = 1n << 64n;
  const THIRTY_ONE = 1n << 31n;

  let b = -1;
  let j = 0;
  let k = ((key % MOD) + MOD) % MOD;
  let loopCount = 0;

  while (j < numBuckets) {
    b = j;
    k = (k * LCG_MULT + 1n) % MOD;
    // (key >> 33) is the top 31 bits of the 64-bit state.
    const topBits = Number(k >> 33n);
    const ratio = Number(THIRTY_ONE) / (topBits + 1);
    j = Math.trunc((b + 1) * ratio);
    loopCount++;
  }

  if (iterations) {
    iterations.count = loopCount;
  }
  return b;
}

/** Stable uint64 key derivation for Jump Hash (BigInt input). */
export function keyHash64(key: string): bigint {
  const hi = fnv1a32(`${key}::hi`, 0x811c9dc5);
  const lo = fnv1a32(`${key}::lo`, 0x9747b28c);
  return (BigInt(hi) << 32n) | BigInt(lo);
}

/** Ring construction: virtual node positions for one physical node. */
export function buildVnodesForNode(nodeId: string, vnodeCount: number): Array<{ position: number; vnodeIndex: number }> {
  const out: Array<{ position: number; vnodeIndex: number }> = [];
  for (let v = 0; v < vnodeCount; v++) {
    out.push({
      position: fnv1a32(`${nodeId}#v${v}`, HASH_SEEDS.vnodePosition),
      vnodeIndex: v,
    });
  }
  return out;
}

/**
 * Ring lookup: first vnode at-or-after the key hash (wrap-around).
 * Binary search over sorted positions; comparison count instrumented.
 */
export function ringLookup(
  ring: ReadonlyArray<{ position: number; nodeId: string }>,
  key: string,
  comparisons?: { count: number },
): string {
  if (ring.length === 0) {
    throw new Error('ringLookup: empty ring');
  }
  const h = keyHash32(key);
  let lo = 0;
  let hi = ring.length;
  let cmp = 0;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    cmp++;
    if (ring[mid]!.position <= h) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  if (comparisons) {
    comparisons.count = cmp;
  }
  // lo = index of first vnode with position > h; wrap to 0 if at end.
  const idx = lo === ring.length ? 0 : lo;
  return ring[idx]!.nodeId;
}

/** Rendezvous / HRW: argmax over per-node scores. Tie-break: first node in sorted id order. */
export function hrwLookup(
  nodeIds: ReadonlyArray<string>,
  key: string,
  hashComputations?: { count: number },
): string {
  if (nodeIds.length === 0) {
    throw new Error('hrwLookup: no nodes');
  }
  let best = -1;
  let bestNode: string | null = null;
  let computed = 0;
  for (const nodeId of [...nodeIds].sort()) {
    const score = fnv1a32(`${key}@@${nodeId}`, HASH_SEEDS.hrwPair);
    computed++;
    if (score > best) {
      best = score;
      bestNode = nodeId;
    }
    // strict >: on ties keep the earlier node in sorted order
  }
  if (hashComputations) {
    hashComputations.count = computed;
  }
  return bestNode as string;
}

/** Naive baseline: hash(key) % N, labeled by node id. */
export function naiveLookup(key: string, nodeIds: ReadonlyArray<string>): string {
  if (nodeIds.length === 0) {
    throw new Error('naiveLookup: no nodes');
  }
  const idx = keyHash32(key) % nodeIds.length;
  return nodeIds[idx] as string;
}

/**
 * Jump bucket index -> node label: bucket i maps to the i-th node in the
 * stable insertion-ordered node list.
 */
export function jumpLabel(bucketIndex: number, nodeIds: ReadonlyArray<string>): string {
  const clamped = Math.min(Math.max(0, bucketIndex), nodeIds.length - 1);
  return nodeIds[clamped] ?? `jump-${bucketIndex}`;
}
