import { describe, expect, it } from 'vitest';

import {
  type ScenarioPermalinkPayload,
  decodeScenarioPermalink,
  encodeScenarioPermalink,
  generateShareableUrl,
} from './permalink';

describe('Simulation Scenario Permalink Utilities', () => {
  it('round-trips scenario payload cleanly through URL-safe base64', () => {
    const original: ScenarioPermalinkPayload = {
      domain: 'rate-limiter',
      scenarioId: 'boundary-burst',
      tick: 42,
      seed: 1337,
      params: { clientCount: 5, algorithm: 'TOKEN_BUCKET' },
    };

    const encoded = encodeScenarioPermalink(original);
    expect(encoded).not.toContain('+');
    expect(encoded).not.toContain('/');
    expect(encoded).not.toContain('=');

    const decoded = decodeScenarioPermalink(`?p=${encoded}`);
    expect(decoded).toEqual(original);
  });

  it('decodes human-readable fallback query params', () => {
    const search = '?domain=distributed-lock&scenario=kleppmann-gc-pause&tick=100&seed=99';
    const decoded = decodeScenarioPermalink(search);

    expect(decoded).toEqual({
      domain: 'distributed-lock',
      scenarioId: 'kleppmann-gc-pause',
      tick: 100,
      seed: 99,
    });
  });

  it('gracefully handles corrupt base64 string and returns fallback or null', () => {
    const corrupt = '?p=not-a-valid-json-string-12345';
    const decoded = decodeScenarioPermalink(corrupt);
    expect(decoded).toBeNull();
  });

  it('generates well-formed URL with domain path and search query', () => {
    const payload: ScenarioPermalinkPayload = {
      domain: 'llm-serving',
      scenarioId: 'continuous-batching-burst',
    };
    const url = generateShareableUrl(payload, 'https://thevisualizer.dev');
    expect(url).toContain('https://thevisualizer.dev/llm-serving?p=');
  });
});
