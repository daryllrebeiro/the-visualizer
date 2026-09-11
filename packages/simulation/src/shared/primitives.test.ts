import { describe, expect, it } from 'vitest';

import {
  canonicalStringify,
  clamp,
  clamp01,
  contentHash,
  deepClone,
  fnv1a32,
  makeIdFactory,
} from './primitives.js';

describe('shared primitives', () => {
  it('clamps inclusively and bounds ratios', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
    expect(clamp01(1.7)).toBe(1);
    expect(clamp01(-0.2)).toBe(0);
  });

  it('FNV-1a is deterministic, unsigned, and order-sensitive', () => {
    expect(fnv1a32('')).toBe(0x811c9dc5);
    expect(fnv1a32('kafka:room-1')).toBe(fnv1a32('kafka:room-1'));
    expect(fnv1a32('a')).not.toBe(fnv1a32('b'));
    expect(fnv1a32('ab')).toBeGreaterThanOrEqual(0);
    expect(fnv1a32('x'.repeat(1000))).toBeLessThanOrEqual(0xffffffff);
  });

  it('deepClone is value-equal but detached', () => {
    const original = { a: 1, nested: { list: [1, 2, { deep: true }] } };
    const clone = deepClone(original);
    expect(clone).toEqual(original);
    clone.nested.list.push(99);
    expect(original.nested.list).toHaveLength(3);
    expect(deepClone(42)).toBe(42);
    expect(deepClone(null)).toBeNull();
  });

  it('canonicalStringify is byte-stable across key order', () => {
    const a = { b: 1, a: { d: 2, c: [3, { f: 4, e: 5 }] } };
    const b = { a: { c: [3, { e: 5, f: 4 }], d: 2 }, b: 1 };
    expect(canonicalStringify(a)).toBe(canonicalStringify(b));
    expect(canonicalStringify(a)).toBe('{"a":{"c":[3,{"e":5,"f":4}],"d":2},"b":1}');
  });

  it('contentHash is stable and 8 hex chars', () => {
    expect(contentHash({ x: 1, y: [2, 3] })).toBe(contentHash({ y: [2, 3], x: 1 }));
    expect(contentHash({ x: 1 })).toMatch(/^[0-9a-f]{8}$/);
    expect(contentHash({ x: 1 })).not.toBe(contentHash({ x: 2 }));
  });

  it('makeIdFactory emits monotonic, collision-free ids', () => {
    const next = makeIdFactory('evt');
    expect([next(), next(), next()]).toEqual(['evt-0', 'evt-1', 'evt-2']);
  });
});
