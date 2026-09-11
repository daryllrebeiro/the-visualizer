import { describe, expect, it } from 'vitest';

import { ScenarioScriptSchema, type ScenarioScript } from '@the-visualizer/contracts';

import {
  exportScenarioJson,
  importScenarioJson,
  runScenarioScript,
  ScenarioStudio,
  scenarioContentHash,
} from '../index.js';

const BURST: ScenarioScript = {
  version: 1,
  id: 'rl-boundary-burst',
  title: 'Fixed Window Boundary Burst',
  domainId: 'rate-limiter',
  seed: 12345,
  description: 'Two full quotas across a window boundary double the admitted rate.',
  steps: ['Spend the quota at the end of window 1', 'Spend it again at the start of window 2'],
  events: [
    { tick: 9, type: 'RATE_LIMITER_BURST', payload: { clientId: 'client-1', count: 10 } },
    { tick: 11, type: 'RATE_LIMITER_BURST', payload: { clientId: 'client-1', count: 10 } },
  ],
  tags: ['rate-limiting', 'chaos'],
};

describe('executable scenario scripts (Phase 3)', () => {
  it('runs deterministically and reaches the RL-3 flaw', () => {
    const a = runScenarioScript(BURST);
    const b = runScenarioScript(BURST);
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
    expect(a.contentHash).toBe(b.contentHash);
    expect(a.frames).toHaveLength(11);
    const state = a.state as { flawsDemonstrated: { fixedWindowBoundaryBurstDetected: boolean } };
    expect(state.flawsDemonstrated.fixedWindowBoundaryBurstDetected).toBe(true);
  });

  it('changes content hash when any deterministic input changes', () => {
    const base = scenarioContentHash(BURST);
    expect(scenarioContentHash({ ...BURST, seed: 999 })).not.toBe(base);
    expect(
      scenarioContentHash({ ...BURST, events: [{ tick: 1, type: 'RATE_LIMITER_BURST', payload: {} }] }),
    ).not.toBe(base);
  });

  it('round-trips through .scenario.json', () => {
    const json = exportScenarioJson(BURST);
    const imported = importScenarioJson(json);
    expect(imported).toEqual(ScenarioScriptSchema.parse(BURST));
    expect(runScenarioScript(imported).contentHash).toBe(scenarioContentHash(BURST));
  });

  it('rejects a tampered scenario export', () => {
    const json = exportScenarioJson(BURST);
    const tampered = JSON.parse(json) as { script: { seed: number } };
    tampered.script.seed = 1;
    expect(() => importScenarioJson(JSON.stringify(tampered))).toThrow(/content hash mismatch/);
  });

  it('rejects unknown domains, bad JSON, and oversized payloads', () => {
    const unknown = exportScenarioJson({ ...BURST, domainId: 'not-a-domain' });
    expect(() => importScenarioJson(unknown)).toThrow(/unknown domain/);
    expect(() => importScenarioJson('{{{')).toThrow(/not valid JSON/);
    expect(() => importScenarioJson('x'.repeat(2_000_001))).toThrow(/payload size/);
    expect(() => importScenarioJson('{"format":"the-visualizer.scenario.v1"}')).toThrow(/schema invalid/);
  });
});

describe('ScenarioStudio time-travel correctness', () => {
  it('seek replays recorded events, not just ticks', () => {
    const studio = new ScenarioStudio('rate-limiter', 12345);
    studio.step();
    studio.step({ id: 'e1', tick: 2, type: 'RATE_LIMITER_BURST', payload: { clientId: 'c', count: 5 } } as never);
    for (let i = 3; i <= 12; i++) studio.step();
    const at12 = studio.getState();

    // Rewind and fast-forward to the same tick must reproduce the same state.
    studio.seek(0);
    studio.seek(12);
    expect(JSON.stringify(studio.getState())).toBe(JSON.stringify(at12));
  });

  it('exportJson is deterministic and importJson round-trips', () => {
    const studio = new ScenarioStudio('raft', 7);
    for (let i = 0; i < 20; i++) studio.step();
    const json1 = studio.exportJson(0);
    const json2 = studio.exportJson(0);
    expect(json1).toBe(json2);

    const restored = ScenarioStudio.importJson(json1);
    expect(restored.getTick()).toBe(20);
    expect(JSON.stringify(restored.getState())).toBe(JSON.stringify(studio.getState()));
  });
});
