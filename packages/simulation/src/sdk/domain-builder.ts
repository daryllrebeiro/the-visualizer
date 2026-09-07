import {
  DomainRegistry,
  type DomainPlugin,
  type DomainPluginMetadata,
} from '../domains/registry.js';
import type { DeterministicRNG } from '../prng/deterministic-rng.js';

export interface InvariantCheckResult {
  passed: boolean;
  violation?: {
    name: string;
    description: string;
  } | undefined;
}

export type StateReducer<TState, TEvent> = (
  state: TState,
  event: TEvent,
  rng: DeterministicRNG,
) => { nextState: TState; emittedEvents?: TEvent[] };

export type InvariantValidator<TState> = (state: TState) => InvariantCheckResult;

export class DomainPluginBuilder<TState = unknown, TEvent = unknown> {
  private metadata: DomainPluginMetadata;
  private defaultStateFactory?: () => TState;
  private reducer?: StateReducer<TState, TEvent>;
  private invariantValidators: InvariantValidator<TState>[] = [];
  private scenarios: Array<{
    id: string;
    name: string;
    description: string;
    category: string;
    setup: (state: TState) => TState;
    invariants: string[];
  }> = [];

  constructor(
    id: string,
    name: string,
    description: string,
    category: DomainPluginMetadata['category'] = 'SYSTEM_DESIGN',
    fidelityTag: DomainPluginMetadata['fidelityTag'] = 'BEHAVIORAL',
  ) {
    this.metadata = {
      id,
      name,
      description,
      version: '1.0.0',
      category,
      fidelityTag,
    };
  }

  public withCategory(category: DomainPluginMetadata['category']): this {
    this.metadata.category = category;
    return this;
  }

  public withFidelityTag(tag: DomainPluginMetadata['fidelityTag']): this {
    this.metadata.fidelityTag = tag;
    return this;
  }

  public withDefaultState(factory: () => TState): this {
    this.defaultStateFactory = factory;
    return this;
  }

  public withReducer(reducer: StateReducer<TState, TEvent>): this {
    this.reducer = reducer;
    return this;
  }

  public withInvariant(validator: InvariantValidator<TState>): this {
    this.invariantValidators.push(validator);
    return this;
  }

  public withScenario(scenario: {
    id: string;
    name: string;
    description: string;
    category: string;
    setup: (state: TState) => TState;
    invariants: string[];
  }): this {
    this.scenarios.push(scenario);
    return this;
  }

  public build(): DomainPlugin<TState, TEvent> {
    if (!this.defaultStateFactory) {
      throw new Error(`Domain ${this.metadata.id} requires a default state factory`);
    }
    if (!this.reducer) {
      throw new Error(`Domain ${this.metadata.id} requires a state transition reducer`);
    }

    const defaultFactory = this.defaultStateFactory;
    const activeReducer = this.reducer;
    const validators = [...this.invariantValidators];

    const plugin: DomainPlugin<TState, TEvent> = {
      metadata: this.metadata,
      createDefaultState: defaultFactory,
      reduceState: (state, event, rng) => {
        const result = activeReducer(state, event, rng);
        return {
          nextState: result.nextState,
          emittedEvents: result.emittedEvents ?? [],
        };
      },
      validateInvariants: (state) => {
        for (const validator of validators) {
          const res = validator(state);
          if (!res.passed) {
            return res.violation
              ? { passed: false, violation: res.violation }
              : { passed: false };
          }
        }
        return { passed: true };
      },
      scenarioLibrary: this.scenarios,
    };

    return plugin;
  }

  public register(): DomainPlugin<TState, TEvent> {
    const plugin = this.build();
    DomainRegistry.register(plugin);
    return plugin;
  }
}
