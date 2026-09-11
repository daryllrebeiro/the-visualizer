import { z } from 'zod';

/**
 * Executable scenario scripts (Phase 3 — Scenario Studio).
 *
 * A scenario is a deterministic event script: `domainId + seed + ordered
 * events` replayed through the domain's pure reducer. This replaces the older
 * prose-only `steps: string[]` for scenarios that need to actually run.
 */

export const ScenarioEventSchema = z.object({
  tick: z.number().int().positive().max(1000000),
  type: z.string().min(1).max(128),
  payload: z.record(z.string().min(1).max(128), z.unknown()).default({}),
});

export const ScenarioScriptSchema = z.object({
  version: z.literal(1),
  id: z.string().min(1).max(128),
  title: z.string().min(1).max(200),
  domainId: z.string().min(1).max(64),
  seed: z.number().int().nonnegative().max(4294967295),
  description: z.string().min(1).max(2000),
  /** Narrative beats for the UI; index-aligned with notable events. */
  steps: z.array(z.string().min(1).max(500)).max(40).default([]),
  events: z.array(ScenarioEventSchema).min(1).max(1000),
  invariantTarget: z.string().min(1).max(128).optional(),
  tags: z.array(z.string().min(1).max(64)).max(12).default([]),
});

export type ScenarioEvent = z.infer<typeof ScenarioEventSchema>;
export type ScenarioScript = z.infer<typeof ScenarioScriptSchema>;

/** Exported `.scenario.json` envelope: script + deterministic content address. */
export const ScenarioExportSchema = z.object({
  format: z.literal('the-visualizer.scenario.v1'),
  script: ScenarioScriptSchema,
  contentHash: z.string().min(1).max(64),
});

export type ScenarioExport = z.infer<typeof ScenarioExportSchema>;

// ─── Content addressing ──────────────────────────────────────────────────────
// Implemented here (zod + pure JS only) so the API and the simulation package
// share one canonical algorithm instead of duplicating a hasher that could
// drift. Callers must never re-implement this.

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      out[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

/** Canonical JSON with recursively sorted keys (byte-stable). */
export function canonicalScenarioJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function fnv1a32Hex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** Content address over the deterministic core of a scenario script. */
export function scenarioContentHash(script: ScenarioScript): string {
  const parsed = ScenarioScriptSchema.parse(script);
  return fnv1a32Hex(
    canonicalScenarioJson({
      version: parsed.version,
      id: parsed.id,
      domainId: parsed.domainId,
      seed: parsed.seed,
      events: parsed.events,
    }),
  );
}
