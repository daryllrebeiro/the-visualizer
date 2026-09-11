import {
  ScenarioExportSchema,
  ScenarioScriptSchema,
  scenarioContentHash as sharedScenarioContentHash,
  type ScenarioEvent,
  type ScenarioScript,
} from '@the-visualizer/contracts';

import { DomainRegistry } from '../domains/registry.js';
import { DeterministicRNG } from '../prng/deterministic-rng.js';

export interface ScenarioRunTick {
  tick: number;
  state: unknown;
  violation: { name: string; description: string } | null;
}

export interface ScenarioRunResult {
  domainId: string;
  seed: number;
  /** Final state after the whole script. */
  state: unknown;
  /** Per-tick frames (index 0 = tick 1) for scrubbing. */
  frames: ScenarioRunTick[];
  /** First invariant violation encountered, if any. */
  violation: { name: string; description: string; tick: number } | null;
  contentHash: string;
}

/**
 * Runs an executable scenario script through the domain reducer.
 *
 * Determinism contract: identical `(domainId, seed, events)` always yields an
 * identical state and identical `contentHash`. Ticks with no scheduled event
 * still advance a synthetic domain TICK, exactly like the gateway runner, so a
 * script's timeline matches a live session's.
 */
export function runScenarioScript(script: ScenarioScript): ScenarioRunResult {
  const parsed = ScenarioScriptSchema.parse(script);
  const plugin = DomainRegistry.get(parsed.domainId);
  if (!plugin) throw new Error(`Unknown domain in scenario: ${parsed.domainId}`);

  const rng = new DeterministicRNG(parsed.seed);
  const byTick = new Map<number, ScenarioEvent[]>();
  for (const ev of parsed.events) {
    const list = byTick.get(ev.tick) ?? [];
    list.push(ev);
    byTick.set(ev.tick, list);
  }

  const maxTick = Math.max(...parsed.events.map((e) => e.tick));
  let state: unknown = plugin.createDefaultState();
  const frames: ScenarioRunTick[] = [];
  let firstViolation: ScenarioRunResult['violation'] = null;
  let seq = 0;

  for (let tick = 1; tick <= maxTick; tick++) {
    const scheduled = byTick.get(tick) ?? [];
    const applied: Array<{ id: string; tick: number; type: string; payload: Record<string, unknown> }> =
      scheduled.length > 0
        ? scheduled.map((e) => ({
            id: `scenario-${String(seq++)}`,
            tick: e.tick,
            type: e.type,
            payload: e.payload,
          }))
        : [
            {
              id: `scenario-tick-${String(tick)}`,
              tick,
              type: `${parsed.domainId.toUpperCase().replace(/-/g, '_')}_TICK`,
              payload: {},
            },
          ];

    for (const ev of applied) {
      state = plugin.reduceState(state, ev, rng).nextState;
    }

    const check = plugin.validateInvariants(state);
    const violation = check.passed || !check.violation ? null : { ...check.violation };
    frames.push({ tick, state, violation });
    if (!firstViolation && violation) {
      firstViolation = { ...violation, tick };
    }
  }

  return {
    domainId: parsed.domainId,
    seed: parsed.seed,
    state,
    frames,
    violation: firstViolation,
    contentHash: scenarioContentHash(parsed),
  };
}

/** Content address over the deterministic core of a script (shared impl). */
export function scenarioContentHash(script: ScenarioScript): string {
  return sharedScenarioContentHash(script);
}

/** Serializes a script to a validated `.scenario.json` envelope. */
export function exportScenarioJson(script: ScenarioScript): string {
  const parsed = ScenarioScriptSchema.parse(script);
  const envelope = ScenarioExportSchema.parse({
    format: 'the-visualizer.scenario.v1',
    script: parsed,
    contentHash: scenarioContentHash(parsed),
  });
  return JSON.stringify(envelope, null, 2);
}

/**
 * Parses an untrusted `.scenario.json`. Validates structure, verifies the
 * embedded content hash matches the payload, and rejects scripts whose domain
 * is not registered. Returns the script or throws with a `Scenario import` error.
 */
export function importScenarioJson(json: string): ScenarioScript {
  if (typeof json !== 'string' || json.length === 0 || json.length > 2_000_000) {
    throw new Error('Scenario import: payload size invalid');
  }
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error('Scenario import: not valid JSON');
  }
  const envelope = ScenarioExportSchema.safeParse(raw);
  if (!envelope.success) throw new Error('Scenario import: schema invalid');
  const script = envelope.data.script;
  if (scenarioContentHash(script) !== envelope.data.contentHash) {
    throw new Error('Scenario import: content hash mismatch (tampered or stale)');
  }
  if (!DomainRegistry.get(script.domainId)) {
    throw new Error(`Scenario import: unknown domain ${script.domainId}`);
  }
  return script;
}
