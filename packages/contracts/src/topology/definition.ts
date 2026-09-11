import { z } from 'zod';

/**
 * Structural bounds for user-supplied topology `definition` JSON.
 *
 * The definition is stored as jsonb and re-parsed on every room join and tick,
 * so it is a denial-of-service surface: unbounded nesting, key counts, or
 * payload size degrade every member of a room. These limits are enforced before
 * the value is accepted, independent of the request body limit.
 */
export const DEFINITION_LIMITS = {
  maxSerializedBytes: 200 * 1024,
  maxDepth: 10,
  maxKeysPerObject: 500,
  maxArrayLength: 2000,
  maxKeyLength: 128,
  maxStringLength: 20000,
} as const;

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export interface DefinitionIssue {
  path: string;
  reason: string;
}

/** Returns a list of structural violations; empty means the definition is safe. */
export function inspectDefinition(value: unknown): DefinitionIssue[] {
  const issues: DefinitionIssue[] = [];

  const serialized = safeStringify(value);
  if (serialized === null) {
    return [{ path: '$', reason: 'not JSON-serializable' }];
  }
  if (serialized.length > DEFINITION_LIMITS.maxSerializedBytes) {
    issues.push({ path: '$', reason: `exceeds ${String(DEFINITION_LIMITS.maxSerializedBytes)} bytes` });
  }

  walk(value, '$', 0, issues);
  return issues;
}

function walk(value: unknown, path: string, depth: number, issues: DefinitionIssue[]): void {
  if (issues.length > 20) return;
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'string' && value.length > DEFINITION_LIMITS.maxStringLength) {
      issues.push({ path, reason: 'string too long' });
    }
    return;
  }
  if (depth >= DEFINITION_LIMITS.maxDepth) {
    issues.push({ path, reason: 'max depth exceeded' });
    return;
  }

  if (Array.isArray(value)) {
    if (value.length > DEFINITION_LIMITS.maxArrayLength) {
      issues.push({ path, reason: 'array too long' });
    }
    const limit = Math.min(value.length, DEFINITION_LIMITS.maxArrayLength);
    for (let i = 0; i < limit; i++) walk(value[i], `${path}[${String(i)}]`, depth + 1, issues);
    return;
  }

  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > DEFINITION_LIMITS.maxKeysPerObject) {
    issues.push({ path, reason: 'too many keys' });
  }
  for (const [key, child] of entries.slice(0, DEFINITION_LIMITS.maxKeysPerObject)) {
    if (FORBIDDEN_KEYS.has(key)) {
      issues.push({ path: `${path}.${key}`, reason: 'forbidden key (prototype pollution)' });
      continue;
    }
    if (key.length > DEFINITION_LIMITS.maxKeyLength) {
      issues.push({ path: `${path}.${key.slice(0, 32)}…`, reason: 'key too long' });
      continue;
    }
    walk(child, `${path}.${key}`, depth + 1, issues);
  }
}

function safeStringify(value: unknown): string | null {
  try {
    return JSON.stringify(value) ?? null;
  } catch {
    return null;
  }
}

/**
 * Zod schema for a topology `definition`. Accepts any object shape (domains are
 * heterogeneous) but rejects the structural hazards above with a helpful path.
 */
export const BoundedDefinitionSchema = z.record(z.string(), z.unknown()).superRefine((value, ctx) => {
  for (const issue of inspectDefinition(value)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: [issue.path], message: issue.reason });
  }
});

/** Canonical domain-id validation for a topology, independent of shape. */
export const TopologyDomainIdSchema = z.string().min(1).max(64);
