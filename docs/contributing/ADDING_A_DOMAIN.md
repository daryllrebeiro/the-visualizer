# Adding a New Domain Visualizer

Follow this step-by-step guide to add a new distributed systems visualizer (e.g. `etcd`, `cassandra`, `consul`, `mongodb`) to TheVisualizer.

---

## 1. Quick Start Scaffolding

Run the domain scaffolding generator:

```bash
pnpm create:domain <domain-id> "<Domain Display Name>"
# Example:
pnpm create:domain etcd "etcd Raft KV"
```

This creates:

- `packages/simulation/src/domains/<domain-id>/<domain-id>-types.ts`
- `packages/simulation/src/domains/<domain-id>/<domain-id>-state-transitions.ts`
- `packages/simulation/src/domains/<domain-id>/<domain-id>-invariants.ts`
- `apps/web/src/components/<domain-id>/<DomainName>Visualizer.tsx`

---

## 2. Implement the Pure State Reducer

In `packages/simulation/src/domains/<domain-id>/<domain-id>-state-transitions.ts`:

- Define default cluster state.
- Implement the transition function `pure<Domain>Transition(state, event, rng)`.
- **CRITICAL RULE**: Never use `Math.random()` or `Date.now()`. Always use the provided `DeterministicRNG`.

---

## 3. Register Domain Plugin

In `packages/simulation/src/domains/registry.ts`:

1. Import your transitions and invariants.
2. Define `DomainPlugin<TState, TEvent>`.
3. Register the plugin in `DomainRegistry`.

---

## 4. Add Golden Determinism Fixtures

Add 2 golden determinism tests in `packages/simulation/src/golden-determinism.test.ts`:

- Baseline initial state hash.
- Multi-step chaos execution hash with deterministic seed.

---

## 5. Verify & Quality Gates

Run all quality checks:

```bash
pnpm typecheck
pnpm test:determinism
pnpm test:all
```
