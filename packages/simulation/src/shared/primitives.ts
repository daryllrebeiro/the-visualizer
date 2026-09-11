/**
 * Shared deterministic primitives for the simulation kernel.
 *
 * These exist to stop the copy-paste drift that had accumulated across the
 * domain modules (FNV-1a had four near-identical implementations, `clamp`
 * nine, and ad-hoc `JSON.parse(JSON.stringify())` clones throughout). Every
 * helper here is pure and deterministic — no `Date.now`, no `Math.random`.
 */

/** Clamp `value` into the inclusive range [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/** Clamp into [0, 1] — the common probability/ratio case. */
export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

/**
 * FNV-1a 32-bit hash. Deterministic across platforms; used for seed
 * derivation, ring placement, and content addressing.
 */
export function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Structured clone of a JSON-serializable value. Prefers the platform
 * `structuredClone` when available, falling back to JSON round-tripping so the
 * kernel behaves identically in Node, browsers, and workers.
 */
export function deepClone<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  const globalClone = (globalThis as { structuredClone?: <U>(v: U) => U }).structuredClone;
  if (typeof globalClone === 'function') {
    return globalClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Canonical JSON with recursively sorted object keys. Byte-stable output is
 * what makes content-addressed replay hashes and golden vectors reliable.
 */
export function canonicalStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      out[key] = sortValue((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

/**
 * Content hash (FNV-1a hex) of a canonicalized value. Sufficient for
 * de-duplication and permalink content addressing; not a cryptographic digest.
 */
export function contentHash(value: unknown): string {
  return fnv1a32(canonicalStringify(value)).toString(16).padStart(8, '0');
}

/** Monotonic sequence helper for deterministic synthetic event ids. */
export function makeIdFactory(prefix: string): () => string {
  let n = 0;
  return () => `${prefix}-${String(n++)}`;
}
