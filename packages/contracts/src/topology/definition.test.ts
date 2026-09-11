import { describe, expect, it } from 'vitest';

import { BoundedDefinitionSchema, DEFINITION_LIMITS, inspectDefinition } from './definition.js';

describe('topology definition bounds (DoS hardening)', () => {
  it('accepts ordinary definitions', () => {
    expect(BoundedDefinitionSchema.safeParse({ brokers: 3, partitions: [0, 1, 2] }).success).toBe(true);
    expect(inspectDefinition({ a: { b: { c: 1 } } })).toEqual([]);
  });

  it('rejects excessive nesting', () => {
    let deep: Record<string, unknown> = { leaf: true };
    for (let i = 0; i < DEFINITION_LIMITS.maxDepth + 5; i++) deep = { nested: deep };
    const issues = inspectDefinition(deep);
    expect(issues.some((i) => i.reason === 'max depth exceeded')).toBe(true);
    expect(BoundedDefinitionSchema.safeParse(deep).success).toBe(false);
  });

  it('rejects too many keys', () => {
    const wide: Record<string, number> = {};
    for (let i = 0; i < DEFINITION_LIMITS.maxKeysPerObject + 1; i++) wide[`k${String(i)}`] = i;
    const issues = inspectDefinition(wide);
    expect(issues.some((i) => i.reason === 'too many keys')).toBe(true);
    expect(BoundedDefinitionSchema.safeParse(wide).success).toBe(false);
  });

  it('rejects oversized serialized payloads', () => {
    const big = { blob: 'x'.repeat(DEFINITION_LIMITS.maxStringLength + 1) };
    const issues = inspectDefinition(big);
    expect(issues.some((i) => i.reason === 'string too long')).toBe(true);
  });

  it('rejects prototype-pollution keys', () => {
    const hostile = JSON.parse('{"__proto__":{"polluted":true},"constructor":{"x":1}}') as Record<string, unknown>;
    const issues = inspectDefinition(hostile);
    expect(issues.filter((i) => i.reason.includes('prototype pollution'))).toHaveLength(2);
    expect(BoundedDefinitionSchema.safeParse(hostile).success).toBe(false);
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });

  it('rejects non-serializable values', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic['self'] = cyclic;
    expect(inspectDefinition(cyclic)).toEqual([{ path: '$', reason: 'not JSON-serializable' }]);
  });
});
