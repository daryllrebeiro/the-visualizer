import { describe, expect, it } from 'vitest';

import { DomainPluginBuilder } from '../sdk/domain-builder.js';
import { ScenarioStudio } from './scenario-studio.js';

describe('ScenarioStudio & DomainPluginBuilder', () => {
  it('should build and register a custom domain with DomainPluginBuilder', () => {
    interface CounterState {
      count: number;
      tick: number;
    }
    interface CounterEvent {
      id: string;
      tick: number;
      type: string;
      payload?: { delta?: number };
    }

    const plugin = new DomainPluginBuilder<CounterState, CounterEvent>(
      'custom-counter',
      'Custom Counter',
      'Pedagogical counter domain for testing SDK DSL',
    )
      .withDefaultState(() => ({ count: 0, tick: 0 }))
      .withReducer((state, event) => {
        const delta = event.payload?.delta ?? 1;
        return {
          nextState: {
            count: state.count + delta,
            tick: state.tick + 1,
          },
        };
      })
      .withInvariant((state) => {
        if (state.count < 0) {
          return {
            passed: false,
            violation: { name: 'NonNegativeCount', description: 'Counter must not be negative' },
          };
        }
        return { passed: true };
      })
      .register();

    expect(plugin.metadata.id).toBe('custom-counter');
    expect(plugin.createDefaultState()).toEqual({ count: 0, tick: 0 });
  });

  it('should record, step, seek, and export/import bundles with ScenarioStudio', () => {
    const studio = new ScenarioStudio('raft', 12345, 5);
    expect(studio.getTick()).toBe(0);

    for (let i = 0; i < 20; i++) {
      studio.step();
    }
    expect(studio.getTick()).toBe(20);

    const stateAt20 = studio.getState();
    expect(stateAt20).toBeDefined();

    // Time-travel seek to tick 10
    const stateAt10 = studio.seek(10);
    expect(studio.getTick()).toBe(10);
    expect(stateAt10).toBeDefined();

    // Time-travel seek forward to tick 15
    const stateAt15 = studio.seek(15);
    expect(studio.getTick()).toBe(15);
    expect(stateAt15).toBeDefined();

    // Export bundle
    const bundle = studio.exportBundle();
    expect(bundle.domainId).toBe('raft');
    expect(bundle.keyframes.length).toBeGreaterThan(0);

    // Import bundle
    const importedStudio = ScenarioStudio.importBundle(bundle);
    expect(importedStudio.getTick()).toBe(15);
  });
});
