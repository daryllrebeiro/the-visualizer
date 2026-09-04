import type { DeterministicRNG } from '../../prng/deterministic-rng.js';
import type { SnowflakeDecomposition } from './id-gen-types.js';

const TIMESTAMP_BITS = 41n;
const WORKER_ID_BITS = 10n;
const SEQUENCE_BITS = 12n;

const MAX_WORKER_ID = (1n << WORKER_ID_BITS) - 1n; // 1023
const MAX_SEQUENCE = (1n << SEQUENCE_BITS) - 1n; // 4095

const WORKER_SHIFT = SEQUENCE_BITS; // 12
const TIMESTAMP_SHIFT = SEQUENCE_BITS + WORKER_ID_BITS; // 22

/**
 * Builds a 64-bit Twitter Snowflake ID using BigInt bitwise shifts.
 */
export function generateSnowflakeBigInt(
  timestampDeltaMs: number,
  workerId: number,
  sequence: number,
): bigint {
  const tsBig = BigInt(timestampDeltaMs) & ((1n << TIMESTAMP_BITS) - 1n);
  const workerBig = BigInt(workerId) & MAX_WORKER_ID;
  const seqBig = BigInt(sequence) & MAX_SEQUENCE;

  return (tsBig << TIMESTAMP_SHIFT) | (workerBig << WORKER_SHIFT) | seqBig;
}

/**
 * Decomposes a 64-bit Snowflake ID into its constituent bit fields.
 */
export function decomposeSnowflake(rawId: bigint): SnowflakeDecomposition {
  const signBit = Number((rawId >> 63n) & 1n);
  const timestampDeltaMs = Number((rawId >> TIMESTAMP_SHIFT) & ((1n << TIMESTAMP_BITS) - 1n));
  const workerId = Number((rawId >> WORKER_SHIFT) & MAX_WORKER_ID);
  const sequence = Number(rawId & MAX_SEQUENCE);

  const binStr = rawId.toString(2).padStart(64, '0');
  const formattedBinary = `${binStr.slice(0, 1)} | ${binStr.slice(1, 42)} | ${binStr.slice(42, 52)} | ${binStr.slice(52, 64)}`;

  return {
    rawIdString: rawId.toString(10),
    signBit,
    timestampDeltaMs,
    workerId,
    sequence,
    formattedBinary,
  };
}

/**
 * Generates deterministic UUIDv4 (purely random, non-sortable)
 */
export function generateDeterministicUuidV4(rng: DeterministicRNG): string {
  const hex = () => (rng.nextInt(0, 0xffffffff) >>> 0).toString(16).padStart(8, '0');
  const h1 = hex();
  const h2 = hex();
  const h3 = hex();
  const h4 = hex();
  // 8-4-4-4-12
  const p1 = h1;
  const p2 = h2.slice(0, 4);
  const p3 = `4${h2.slice(5, 8)}`; // version 4
  const p4 = `8${h3.slice(1, 4)}`; // variant 1
  const p5 = `${h3.slice(4, 8)}${h4}`;
  return `${p1}-${p2}-${p3}-${p4}-${p5}`;
}

/**
 * Generates deterministic RFC 9562 UUIDv7 (k-sortable 48-bit timestamp prefix)
 */
export function generateDeterministicUuidV7(timestampMs: number, rng: DeterministicRNG): string {
  const tsHex = timestampMs.toString(16).padStart(12, '0');
  const randA = rng.nextInt(0, 0xfff).toString(16).padStart(3, '0');
  const randB = rng.nextInt(0, 0x3fff).toString(16).padStart(4, '0');
  const randC = (rng.nextInt(0, 0xffffffff) >>> 0).toString(16).padStart(8, '0');
  const randD = rng.nextInt(0, 0xffff).toString(16).padStart(4, '0');

  // Format: 8-4-4-4-12
  const p1 = tsHex.slice(0, 8);
  const p2 = tsHex.slice(8, 12);
  const p3 = `7${randA}`;
  const p4 = `8${randB.slice(1, 4)}`;
  const p5 = `${randC}${randD}`;

  return `${p1}-${p2}-${p3}-${p4}-${p5}`;
}
