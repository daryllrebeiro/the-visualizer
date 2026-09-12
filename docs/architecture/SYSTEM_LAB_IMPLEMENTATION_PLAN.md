# System Lab — Super-Detailed Implementation Plan

> Status: PLAN (no code changed). Baseline inspected 2026-09-12 on `main@3c6ea42`.
> Goal: evolve TheVisualizer from 30 single-domain visualizers into a composable,
> deterministic System Lab (Explore → Understand → Build → Simulate → Break → Fix → Learn)
> WITHOUT creating a second simulation engine.
> North star: `SYSTEM MODEL → SIMULATION → EVENTS → STATE TRANSITIONS → VISUALIZATION`.
> UI never owns simulation truth.

---

## 0. Verified baseline (Phase 0 — do not skip)

### 0.1 Git / tree

- Branch `main`, clean except untracked `dist-edge/` (portable kernel bundle output — gitignored or removed before work).
- HEAD `3c6ea42 docs: roadmap status…`; prior `9d991dd`, `1a69b17` (Streams + worker pool + egress validation), `20f2594` (replay persistence, classroom), `ef530c8` (contracts), `18b3fda` (SDK GA), `f3884c8` (scenario studio), `d948767` (rag+agents registration → **30 domains**, not 28).
- Prompt's "28 domains" is stale. Registry (`packages/simulation/src/domains/registry.ts`, 1132 lines) holds 30: the 28 listed + `rag` + `agents`. Any plan/test asserting 28 will fail. Golden suite per `PHASE_2_3_COMPLETION.md` is 93 vectors (30 domains), not 89.

### 0.2 Implementation matrix (verified by read, not assumed)

| Task | Status | Existing implementation | Tests | Remaining work |
|---|---|---|---|---|
| Committed SHA-256 golden vectors + throw-propagating harness + RNG-burn removal | DONE | `golden-determinism.test.ts`, `golden-vectors.update.test.ts`, 93 vectors | `pnpm test:determinism` 93/93 per completion doc | None; extend to composite systems (new vectors, same harness) |
| Gateway tick breaker + single-owner leases + atomic Lua drain + `hash(roomId,domainId)` seeds + monotonic IDs + per-session memory guard + pipelined writes | DONE (Phase 1) + Streams + worker pool (Phase 2) | `apps/ws-gateway/src/gateway/runner.ts`, `TickWorkerPool`, `TickBudget`, Streams `XADD MAXLEN`, Lua `XRANGE+XDEL+XLEN` drain | gateway egress integration test, worker-equivalence, TickBudget units, 40/41 integration | Composite runtime must reuse these paths, not fork them |
| Typed API errors, pg-code mapping, atomic authorize-and-mutate, cursor pagination, register-409, rotation-reuse, jti, login bucket, deleted-user fail-closed, Redis WS tickets, JWT-secret gate, `/ready` | DONE | `apps/api/*` | 42/42 API integration (review-era) | Reuse for `simulation_replays`, classroom, future system-definition persistence |
| OTLP wiring, migration 0002+0003, CI Playwright, soak-port, build-then-scan, readiness waits | DONE | `packages/logging/src/otel.ts`, `0003` content_hash, CI jobs | build 9/9 | None for System Lab MVP |
| Egress contract + per-domain intent schemas + `SessionLimitsSchema` generalization | DONE | `GatewayServerMessageSchema`, `packEgress`/`publishRoomUpdate` (non-prod validation), `domainActionPayloadSchema` | 17 contract tests + egress integration | Add `SystemIntent`/`SystemEvent` schemas the same way; validate in non-prod |
| Scenario studio (executable scripts, event-accurate seek, `.scenario.json`, content-hash tamper rejection) | DONE (engine+contract) | `packages/simulation/src/timeline/scenario-runner.ts` (`runScenarioScript`), `scenario-studio.ts`, `ScenarioScript`/`ScenarioExport` in `@the-visualizer/contracts` | 7 runner + 2 studio tests | Extend `ScenarioScript.domainId` → `systemId`; reuse seek/export/hash code verbatim |
| Plugin SDK GA | DONE | `sdk/domain-builder.ts` (`defineDomainPlugin`, `PLUGIN_API_VERSION`, `assertPluginCompatible`) | 4 builder tests | Components map to plugins via adapter; SDK unchanged |
| Replay persistence (content-addressed, dedupe, membership-gated) | DONE | `simulation_replays` + `content_hash`, `ReplayRepository`, `POST/GET /replays` | 2 integration | Persist composite replays through same table/API; no new table in MVP |
| Classroom presenter/student | DONE (app layer) | contracts + API + `/classroom` page | 3 integration | Classroom consumes System Lab scenarios later; no new infra in MVP |
| WASM portable kernel | DONE (portability-verified) | `wasm/edge-kernel.ts`, `dist-edge/sim-kernel.js` (`platform=neutral`), VM-sandbox proof | 4 tests | Composite kernel must stay portable (no Node builtins, no `Date.now`/`Math.random`) |
| Canvas strangler cutover | **NOT DONE** (only step 1) | `domain-canvas-registry.ts` = 39-line routing helper (`canvasKindFor`: kafka/panel/bespoke/generic); `GenericDomainCanvas` store-driven; live shell still `apps/web/src/app/VisualizerApp.tsx` **4855 lines / 197 KB** | `simulation-store.test.ts` 7 tests | Full cutover: one domain per PR, kafka last, delete migrated code. **P0 blocker for System Lab UI** — new system canvases must be born on the new path, never inside the monolith |
| `useSimulationStore` genericization | **NOT DONE** | `apps/web/src/stores/simulation-store.ts` (222 lines): `state: any`, hardcoded seed `12345` ×3, `plugin: DomainPlugin` untyped default | passes | `state: unknown` + per-domain narrowing, seed injection, reuse for system runtime store |
| ADR-001 (generalize/delete `SimulationEngine`) | **NOT DONE** | `engine/simulation-engine.ts` still Kafka-locked (`KafkaClusterState`, `pureStateTransition`, Kafka `InvariantChecker`); generic path is registry-driven runners + `runScenarioScript` | engine tests | **Decision for Phase 2**: do NOT generalize the class; freeze it as `KafkaSimulationEngine` (legacy) and standardize composite + all new execution on registry-driven `SystemRuntime` + existing `VirtualTimeline`. Delete only when Kafka visualizer migrates |
| Wire-contract validation in prod path | Partial (non-prod only) | noted above | — | Keep non-prod validation; add system schemas the same way |
| Deduplication (`deepClone`, `clamp`, `fnv1a32`, `canonicalStringify`, `contentHash`, `makeIdFactory`) | DONE (primitives) | `shared/primitives.ts` + 6 tests | — | Composite kernel MUST import these; zero new clones/hash impls |
| `DomainPlugin` typing | **NOT DONE** | `DomainPlugin<TState=any,TEvent=any>` with `scenarioLibrary: any[]`, `oracleAdapter?: any` | — | Introduce `DomainPlugin<State,Event,Action,Scenario>` with `handleAction` (see §2); keep backward-compat aliases so 30 plugins compile untouched, then migrate incrementally |

### 0.3 Key reusable primitives (exact locations)

- RNG: `packages/simulation/src/prng/deterministic-rng.ts` (SplitMix32, fork/restore).
- Scheduler: `packages/simulation/src/scheduler/virtual-timeline.ts` (min-heap, `VirtualTimestamp`, `schedule/peek/pop`, `restoreTick`) + `min-heap.ts`.
- Runner: `timeline/scenario-runner.ts` — deterministic `(domainId,seed,events)→(state,frames,violation,contentHash)` with synthetic TICK fill; the composite runner mirrors this shape.
- Studio/seek/export/hash: `timeline/scenario-studio.ts`; `shared/primitives.ts` (`deepClone, clamp, fnv1a32, canonicalStringify, contentHash, makeIdFactory`).
- Invariants: per-domain `validateInvariants` + `invariants/invariant-checker.ts`; system-level checker composes them.
- Contracts: `packages/contracts/src/` (`ScenarioScript/ScenarioExport`, topology `definition.ts` caps + prototype-pollution rejection, `GatewayServerMessageSchema`, `domainActionPayloadSchema`, `SessionLimitsSchema`).
- Gateway: `apps/ws-gateway/src/gateway/` (`runner.ts`, worker pool, `TickBudget`, Streams intents/replays, leases, breaker, memory guard).
- Web: `apps/web/src/stores/simulation-store.ts`, `components/domains/domain-canvas-registry.ts`, `DomainCanvasAdapter.tsx`, `GenericDomainCanvas`, `/analytics`, `/classroom`, learn timeline (`learn/session-timeline.ts`, `structural-diff.ts`, `permalink-codec.ts`).

### 0.4 Mandatory baseline commands (before each phase)

```powershell
git status --short; git log --oneline -5
pnpm typecheck        # recursive, must stay clean
pnpm test:determinism # 93/93 gate — never regress
pnpm test:unit        # ~507 gate
pnpm lint             # zero new errors
pnpm build            # 9/9
```

---

## 1. Architecture decisions (binding)

1. **No second engine.** Composite execution = `SystemRuntime` orchestrating existing `DomainPlugin.reduceState` instances via the existing `VirtualTimeline` + `DeterministicRNG`. `SimulationEngine` class frozen for Kafka legacy; ADR-001 resolved as "registry-driven wins, Kafka engine deprecated, not generalized".
2. **New package, not new repo layer.** All composite kernel code lives in `packages/simulation/src/systems/` (new dir). Web-only rendering lives in `apps/web/src/components/systems|playground|timeline|inspector|metrics|failures/`. Shared wire shapes live in `packages/contracts/src/systems/`. No other locations permitted (prevents parallel architectures).
3. **Components delegate, never reimplement.** A `SystemComponent` with `domainId: 'redis'` executes `DomainRegistry.get('redis').reduceState`. Pure-orchestration components (gateway/service/queue/client) get a tiny built-in reducer family (`stateless-router`, `queue`, `store-front`) in `systems/builtin-components/` — each <150 lines, same `DomainPlugin`-compatible signature, registered in the same `SYSTEM_REGISTRY` metadata, so the router treats them uniformly.
4. **Determinism contract (non-negotiable).** `(systemDef, seed, inputEvents, failureSchedule) → (states, events, metrics, violations, contentHash)` identical. Bans inside `systems/`: `Date.now`, `performance.now`, `Math.random`, `crypto.randomUUID`, iteration over insertion-ordered maps that affects hashes (always sort keys via `canonicalStringify`). IDs from `makeIdFactory(sessionScope)` monotonic counters. Latency/traffic from seeded RNG only.
5. **UI observes; never computes.** System canvas renders `SystemRuntime` frames + `SystemEvent` stream. No `setTimeout` modeling simulated latency; wall-clock only drives playback cadence (step timer), never simulation time.
6. **Contracts first.** Every new wire shape gets a Zod schema in `packages/contracts` + non-prod gateway validation + exported JSON schema regen. No UI-only message formats.
7. **Persistence reuse.** MVP stores system defs inside existing `topologies(definition)` with `domain_id='system:<systemId>'` + per-`SystemId` definition validation dispatch (extends the existing `definition.ts` validator). No new tables. Composite replays go through existing `simulation_replays` + `ReplayRepository`.
8. **Incremental strangler discipline.** New system UI is born store-driven + lazily loaded; zero new state/handlers in `VisualizerApp.tsx`. Each migrated domain deletes its monolith code in the same PR.

---

## 2. Type design (authoritative sketches — contracts package is truth)

### 2.1 Genericized `DomainPlugin` (backward compatible)

```typescript
// packages/simulation/src/domains/registry.ts (evolve, don't replace)
interface DomainPlugin<State = unknown, Event = { id: string; tick: number; type: string; payload: Record<string, unknown> }, Action = { type: string; payload?: Record<string, unknown> }, Scenario = unknown> {
  metadata: DomainPluginMetadata;
  createDefaultState(seed?: number): State;
  reduceState(state: State, event: Event, rng: DeterministicRng): { nextState: State; emittedEvents: Event[] };
  validateInvariants(state: State): { passed: boolean; violation?: { name: string; description: string } };
  handleAction?(state: State, action: Action, rng: DeterministicRng): { nextState: State; emittedEvents: Event[] };
  actionSchema?: z.ZodType<Action>;           // feeds domainActionPayloadSchema
  scenarios: ScenarioDefinition<Scenario>[];  // replaces scenarioLibrary: any[]
  oracleAdapter?: OracleAdapter<unknown>;     // replaces any
}
// Compat: export type AnyDomainPlugin = DomainPlugin<any, any>; keep old name as alias.
// Migrate 30 plugins by only adding actionSchema/scenarios typing; reducers untouched.
```

### 2.2 System definition (contracts)

```typescript
// packages/contracts/src/systems/definition.ts
const ComponentId = z.string().min(1).max(64);
const ComponentType = z.enum(['client','gateway','service','worker','postgres','redis','kafka','rabbitmq','object-store','cdn','vectordb','llm','embedding','gpu-cluster','websocket-server','queue','lock','database-generic']);
const ComponentCategory = z.enum(['compute','storage','cache','messaging','network','database','ai','observability']);
const Protocol = z.enum(['http','grpc','websocket','tcp','kafka','queue','database','event']);
SystemComponentSchema = z.object({ id: ComponentId, type: ComponentType, name: z.string().min(1).max(80), category: ComponentCategory, domainId: z.string().optional(), // maps to DomainPlugin when present
  config: z.record(z.string(), z.unknown()).default({}), // validated per-type by componentConfigSchema dispatch
  position: z.object({ x: z.number(), y: z.number() }).optional() });
SystemConnectionSchema = z.object({ id: z.string(), source: ComponentId, target: ComponentId, protocol: Protocol, direction: z.enum(['unidirectional','bidirectional']).default('unidirectional'),
  config: z.object({ latencyMs: z.number().min(0).max(60000).default(0), timeoutMs: z.number().min(0).max(600000).optional(), retryPolicy: RetryPolicySchema.optional(), capacityPerSec: z.number().positive().optional() }).default({}) });
SystemDefinitionSchema = z.object({ id: z.string().regex(/^[a-z0-9-]+$/), version: z.string().regex(/^\d+\.\d+\.\d+$/), name: z.string(), description: z.string(),
  components: z.array(SystemComponentSchema).min(1).max(64), connections: z.array(SystemConnectionSchema).max(128),
  scenarios: z.array(SystemScenarioSchema).max(64), invariants: z.array(SystemInvariantSchema).max(32).optional(), metadata: SystemMetadataSchema });
  // cross-refinement: every connection endpoint exists; no self-loops unless bidirectional queue; ids unique.
```

### 2.3 System events / runtime

```typescript
// contracts/src/systems/events.ts
SystemEventTypeSchema = z.enum(['USER_ACTION','HTTP_REQUEST','HTTP_RESPONSE','SERVICE_REQUEST','SERVICE_RESPONSE','CACHE_GET','CACHE_HIT','CACHE_MISS','CACHE_SET','DATABASE_QUERY','DATABASE_RESULT','MESSAGE_PUBLISHED','MESSAGE_CONSUMED','LOCK_ACQUIRED','LOCK_REJECTED','PAYMENT_AUTHORIZED','PAYMENT_FAILED','INVENTORY_RESERVED','INVENTORY_REJECTED','TIMEOUT','RETRY','CIRCUIT_OPENED','COMPONENT_FAILURE','COMPONENT_RECOVERY','RESPONSE_SENT']);
SystemEventSchema = z.object({ id: z.string(), tick: z.number().int().nonnegative(), simTimeMs: z.number().nonnegative(), type: SystemEventTypeSchema,
  source: ComponentId, target: ComponentId.optional(), payload: z.record(z.string(), z.unknown()).default({}), latencyMs: z.number().optional(),
  result: z.enum(['SUCCESS','FAILURE','PENDING']).optional(), causationId: z.string().optional(), explain: z.string().max(500).optional() });
FailureInjectionSchema = z.object({ id: z.string(), target: ComponentId, type: z.enum(['crash','latency','error','partition','capacity']), startTick: z.number().int().nonnegative(), durationTicks: z.number().int().positive().optional(), config: z.record(z.string(), z.unknown()).default({}) });
// simulation/src/systems/runtime.ts
interface SystemRuntimeFrame { tick: number; simTimeMs: number; componentStates: Record<ComponentId, unknown>; activeEvents: SystemEvent[]; metrics: SystemMetrics; violation: SystemInvariantViolation | null; }
interface SystemRunResult { systemId: string; seed: number; frames: SystemRuntimeFrame[]; events: SystemEvent[]; finalStates: Record<ComponentId, unknown>; metrics: SystemMetrics; violation: …|null; contentHash: string; }
runSystemScript(def: SystemDefinition, script: SystemScenarioScript): SystemRunResult // mirrors runScenarioScript: VirtualTimeline + seeded RNG + synthetic ticks + per-tick invariant check + contentHash via canonicalStringify+sha256
```

### 2.4 Registry / validation / metrics / challenges

```typescript
// simulation/src/systems/registry.ts
SYSTEM_REGISTRY: Record<'ecommerce'|'ticket-booking'|'collab-docs'|…, { definition: SystemDefinition; run(script): SystemRunResult; invariants… }>
// simulation/src/systems/validate.ts — returns { errors[]; warnings[]; tradeoffNotes[] } distinguishing ERROR/WARNING/EDUCATIONAL_TRADEOFF (never blocks intentionally-bad experiments, only labels them)
// simulation/src/systems/metrics.ts — pure fold over SystemEvent[] → { rps, success, failed, avg/p50/p95/p99 latency, queueDepth, consumerLag, hitRate, dbUtil, errors, retries, timeouts }
// simulation/src/systems/challenges.ts — rule-based rubric: { checks: [{ id, label, pass: boolean, severity }], score, feedback[] }; no LLM in v1
```

---

## 3. Phased delivery (each phase shippable, gated)

### Phase 1 — Finish stabilization for safe expansion (1–2 wks, P0/P1 only)

- P1.1 Store genericization: `state: any→unknown`, seed param (`new DeterministicRNG(seed)`; default `hash(roomId,domainId)` helper in `shared/primitives`), per-domain narrowing helpers; keep API shape. Test: existing 7 store tests + new seed-injection test.
- P1.2 Canvas strangler restart (one domain per PR, kafka last): add `components/domains/domain-canvas-registry.ts` lazy map (`next/dynamic`, `Record<DomainKey, ComponentType<{state: unknown}>>`), migrate one trivial domain (e.g. `id-gen`) fully off `VisualizerApp` (delete its useState/timer/handlers), add Playwright smoke. Acceptance: shell −N lines, no new shell state, bundle for `/id-gen` shrinks.
- P1.3 Freeze `SimulationEngine` as Kafka-legacy (rename export alias, mark `@deprecated use SystemRuntime`), wire all new code to registry-driven path. Zero behavior change; typecheck + golden gate.
- P1.4 Contract hygiene: regen `json-schemas/`, extend `domainActionPayloadSchema` for redis/db/lock/kafka (needed by MVP components); non-prod egress validation covers new `SystemEvent` envelope.
- Gate: typecheck clean, determinism 93/93, unit green, lint zero-new, `VisualizerApp` line count decreases.

### Phase 2 — Composite system kernel (2–3 wks) — NO UI yet

New files (all under `packages/simulation/src/systems/` + `packages/contracts/src/systems/`):
`types.ts, definition.ts(schema re-export), registry.ts, router.ts(event routing over connections+protocol compat), runtime.ts(VirtualTimeline orchestration, latency via simTimeMs advance, capacity/queue/reject/timeout/shed), builtin-components/{router,queue,store-front}.ts, failures.ts, invariants.ts, metrics.ts, validate.ts, scenarios.ts, goldens.test.ts, property.test.ts (fast-check), README.md`
- Router: adjacency from `connections`; protocol-compat table (e.g. `service→redis` only via `database|tcp`; mismatch → WARNING + deterministic `TIMEOUT` event, never throw).
- Runtime loop per tick: pop due `ScheduledEvent<SystemEvent>`; apply failures active at tick; delegate to `DomainRegistry` plugin or builtin; collect emitted sub-events; schedule follow-ups at `tick + latencyMs` (simulated, NOT `setTimeout`); per-tick system-invariant check → halt + record (mirrors engine halt).
- Replay: `(def, seed, inputEvents, failures)` sufficient; `contentHash = sha256(canonicalStringify({finalStates, events, metrics}))`.
- Acceptance: define 3-node system, execute deterministically, route events, replay identically, invariant violation halts, golden hash committed. Unit: routing, latency advance, capacity shed, failure application, metrics fold, validation severities. Property: `event ids strictly increase`; `replay(seed,actions)===original`; `inventory>=0` / `owners(seat)<=1` on fixtures. Golden: `system.mvp.cache-hit.seed42`, `system.mvp.cache-miss.seed42`.

### Phase 3 — Timeline + playback + inspector (1–2 wks, reusable UI)

- `apps/web/src/components/timeline/{SystemTimeline.tsx, EventInspector.tsx, PlaybackControls.tsx}` + `apps/web/src/stores/system-store.ts` (zustand: `definitionId, frames, cursor, isPlaying, speed, step/reset/replay/seek`, wall-clock only paces frame advance).
- Timeline renders `SystemEvent[]` (virtualized list, collapsible, keyboard navigable, aria labels, never color-only status); Inspector shows source/target/simTime/payload/latency/result + `explain` (from scenario metadata, never hardcoded in component); Playback: Play/Pause/Step/Reset/Replay + 0.5/1/2/5/10x (speed = frame cadence).
- Data-driven `components/systems/SystemCanvas.tsx` (SVG: nodes/edges/status tokens via centralized `system-tokens.ts`: idle/active/success/warning/failure/blocked/degraded) rendering `frames[cursor]` + `activeEvents`.
- Acceptance: user steps a composite run one logical event at a time; clicking event shows inspector; E2E (Playwright): open MVP → play → pause → step → inspect → reset.

### Phase 4 — Composite MVP: `user→gateway→service→redis→database` (1 wk)

- Definition `systems/mvp-cache.ts`: `GET /product/42` with cache-hit (`…→CACHE_HIT→Response`) and cache-miss (`…→CACHE_MISS→DB→CACHE_SET→Response`) scripts; latencies gateway 2ms/redis 1ms/db 15ms; invariants `cache-hit implies no DB query in trace`, `DB result eventually cached`.
- This MVP (not full e-commerce) proves the architecture; §71 acceptance verbatim.
- Golden vectors committed; docs page generated from registry (no hardcoded lists).

### Phase 5 — E-commerce flagship (2 wks)

- `systems/ecommerce.ts` per §15 topology (product/cart/order services, redis ×2, postgres, kafka + 3 consumers). Builtin `service` components delegate where a full plugin exists (redis/kafka/lock/db semantics); simplest semantic representation that executes.
- 9 scenarios A–I as `SystemScenarioScript`s (browse, hit, miss, cart, checkout, payment, inventory, order event, notification); full checkout trace traverses gateway→order→inventory→payment→kafka→notification.
- Invariants: `inventory>=0`, `payment charged at most once per order`, `committed offsets monotonic`. Negative tests tamper each.
- Learn content: component cards (what/why/receives/produces/failure/alternatives) + `explain` strings in scenario metadata powering Explore vs Learn modes.

### Phase 6 — Ticket booking concurrency flagship (2 wks)

- `systems/ticket-booking.ts` (gateway→booking→redis-lock + db→payment→booking) + `withLock`/`withoutLock` variants of same definition (config flag, not fork).
- Scenarios: normal, concurrent A12 race, double-booking attempt, lock expiry, payment failure→rollback, stale lock, retry, db failure. Invariant `owners(seat)<=1`; broken mode demonstrably violates (checker catches; test asserts violation + which scenario).
- "What if lock removed?" is a one-toggle replay — the §72 success-criteria core (steps 1–10).

### Phase 7 — Collaborative docs flagship (2 wks)

- `systems/collab-docs.ts` (3 clients→websocket layer→collab engine→op-log + doc store), labeled "inspired by real-time editors".
- Scenarios: type, broadcast, concurrent edit, conflict, merge, reconnect, offline edit, sync. Invariant: replicas converge after sync (eventual-convergence check on quiesced run). Explanations: OT/CRDT/ordering/conflict-resolution/eventual consistency (metadata, not code).
- Disclaimers in UI + docs that internals are illustrative.

### Phase 8 — Learning layer (1 wk, cross-cuts 5–7)

- Explore/Learn toggle (same simulation, different annotation density: what vs why/trade-offs/alternatives); detail tiers Beginner/Intermediate/Advanced (visualization filter only, model unchanged); component inspector cards; decision callouts.
- Preserve axe CI; keyboard + non-color indicators; text sources in registry metadata (no hardcoded prose in canvases).

### Phase 9 — Playground (3 wks)

- Palette (compute/storage/messaging + curated domain-backed entries) → canvas (add/remove/move/connect/delete/configure/rename/duplicate/inspect) → run/pause/step/inject/reset/save/load. First scope only `add/connect/configure/simulate/reset`; templates load as editable copies (originals immutable in `SYSTEM_REGISTRY`).
- Validation tri-state ERROR/WARNING/EDUCATIONAL_TRADEOFF (e.g. service-no-input ERROR; payment-no-retry WARNING with teaching note). Zod-validated save/load via `topologies(domain_id='system:<id>')`; share later via existing replay/classroom infra.
- Routes lazy: `/systems/[id]` and `/playground` never ship unrelated canvases (`next/dynamic`).
- Acceptance: user builds gateway→service→redis from blank and runs it.

### Phase 10 — Traffic/latency/capacity/failures/metrics (2 wks, kernel-first)

- Deterministic traffic gens (`steady/burst/ramp/seeded`, req/sec presets to 10k logical, executed as scheduled events — no wall-clock); per-component `capacityPerSec` → queue/reject/timeout/shed/retry per config; failure schedule (`crash/latency/error/partition/capacity` with start/duration); metrics fold (rps/success/failed/avg/p50/p95/p99/queue/lag/hit-rate/db-util/errors/retries/timeouts); failure visualization (DOWN badge + cascading TIMEOUT→RETRY→CIRCUIT_OPEN trace).
- "What if Redis disappears / Kafka down / db slow / 100x traffic / service crash / latency spike / lock expiry / double-consume" each = one replay with a failure schedule, fully deterministic.
- Perf: no `JSON.parse(JSON.stringify())` in hot paths (`deepClone` util where needed); emit mutation deltas + event stream, never full-state serialize per tick for viz; worker-pool compatible (no browser/Node-timing APIs in kernel).

### Phase 11 — Challenges (rule-based v1) (1–2 wks)

- Challenge defs (`scenario + constraints + rubric`): e.g. "booking, no double-alloc, 10k users/1k seats/99.9%"; `RUN TEST` executes deterministic scripts; rubric output (`✓ concurrency control / ✓ no dup / ⚠ SPOF / ⚠ no retry`); no LLM judge (AI reviewer later sits atop deterministic score).
- Playground→challenge→fix→re-run loop persisted via replays.

### Phase 12+ — Catalog, AI systems, studio, sharing (sequenced, not parallel)

- Catalog order per §42 (URL shortener → chat → food → video → feed → ride → payment → notifications → search → files → CDN-media), each teaching one new concept; advanced patterns (sharding/quorum/sagas/CQRS/backpressure/…) visualized behaviorally.
- AI systems compose existing `rag/llm-gateway/llm-serving/vectordb/gpu-cluster/llm-eval/model-rollout/feature-store/agents` (RAG pipeline, gateway router, serving, agent w/ tools) — no new AI kernels.
- Scenario Studio export (`.scenario.json` via existing export/import + content hash), then shareable replay URLs on hardened RBAC (content-addressed, versioned defs). Classroom/multiplayer, NL-to-definition, AI hints/reviewer explicitly post-MVP (§41/45/46/66).

---

## 4. File-by-file work list (creation order)

1. `packages/contracts/src/systems/{definition,events,failures,scenarios,challenges}.ts` + `index.ts` re-export + `json-schemas/` regen.
2. `packages/simulation/src/systems/{types,registry,router,runtime,builtin-components/{router,queue,store-front},failures,invariants,metrics,validate,scenarios,index}.ts` + `README.md`.
3. `*.test.ts` beside each: `router, runtime, failures, invariants, metrics, validate` units; `goldens.test.ts` (committed SHA-256); `property.test.ts` (fast-check: id monotonicity, replay identity, seat/inventory invariants).
4. `packages/simulation/src/systems/{mvp-cache,ecommerce,ticket-booking,collab-docs}.ts` + per-system `{scenarios,invariants,learn}.ts` + docs generated from registry.
5. `apps/web/src/stores/system-store.ts`; `components/{systems/SystemCanvas,system-tokens.ts,SYSTEM_CANVASES.ts(lazy)}`; `components/{timeline/SystemTimeline,EventInspector,PlaybackControls,metrics/SystemMetrics,inspector/ComponentInspector,failures/FailurePanel,playground/*,challenges/*}`; routes `app/{systems/[id]/page.tsx,playground/page.tsx}`.
6. Gateway/API wiring: `SystemIntentSchema` handling in runner (validate → `runSystemScript` steps inside worker pool + Streams + breaker + leases — reuse, don't fork); `topologies` definition-dispatch validation for `system:*`; replays via `ReplayRepository`.
7. Tooling: `scripts/create-system.mjs` (only after 3 systems expose the pattern — generates def + registry + schema + golden stub + tests + docs); `check-system-counts.mjs` reading registries (no hardcoded counts).

---

## 5. Testing strategy (DoD per feature: model+runtime+events+transitions+viz+invariants+failures+determinism+unit+integration/e2e+docs, no dead arch)

- Unit (vitest): every file in §4; negative invariant tests per system (valid passes / tampered fails).
- Integration: `system→runtime→event stream→contentHash`; gateway egress validation incl. system envelopes; API replay round-trip.
- E2E (Playwright, CI-gated): open system → run → pause → step → inspect → inject failure → reset; booking race with/without lock; playground build-and-run.
- Golden: existing 93 untouched + new `system.*.seed42` SHA-256 vectors via established harness/regen script.
- Property (fast-check): arbitrary booking sequences ⇒ `owners≤1` (locked) / violation detected (unlocked); arbitrary traffic ⇒ replay identity + id monotonicity.
- A11y/perf: axe on new routes; bundle-size check per lazy route; no hot-path full-tree serialization (review diff for `JSON.parse(JSON.stringify`).

---

## 6. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Strangler stalls; new UI lands in monolith | Lint rule: `VisualizerApp.tsx` may only shrink (line-count check in CI); new canvases rejected unless lazy + store-driven |
| Second-engine drift | `systems/` imports `DomainRegistry, VirtualTimeline, DeterministicRNG, primitives`; PR checklist rejects reimplemented semantics |
| Determinism leak (`Date.now`/random in new code) | Ban via eslint `no-restricted-globals` in `systems/` + golden/property gates |
| Scope explosion (20 systems at once) | MVP→3 flagships→playground→failures→challenges order enforced; §66 premature list (real infra, multiplayer, AI judge, marketplace, billing, social) explicitly out |
| Gateway event-loop overload | Composite ticks run in existing worker pool + TickBudget shed/halt; Streams transport; no new coordination primitives |
| Contract drift repeat | System schemas + non-prod egress validation + regen'd JSON schemas from day one |

---

## 7. Milestone acceptance (condensed §63 + §71 + §72)

- M1 (Phases 1–2): 3-node MVP defined/executed/routed/replayed/invariant-checked/golden-hashed; no new engine; gates green.
- M2 (Phase 3–4): cache-hit/miss steppable, replayable, inspectable, invariant-checked, tested.
- M3 (Phases 5–7): three flagships with all listed scenarios + negative tests + goldens + learn content.
- M4 (Phases 8–9): Explore/Learn + playground `add/connect/configure/simulate/reset` + templates.
- M5 (Phases 10–11): traffic/capacity/failures/metrics + rule-based challenges; full §72 booking journey (race → violation → lock → replay → playground modify → break → fix → save/share) executable end-to-end.

---

## 8. Immediate next actions (no code until baseline recorded)

1. Run §0.4 gates; record actual counts (replace 89/428/42/7 review-era numbers with fresh output).
2. Land P1.1–P1.4 as small PRs (one domain strangler step first).
3. Author contracts `systems/` schemas + `SystemRuntime` skeleton + MVP definition; first composite golden vector.
4. Then expand flagship by flagship per §3. Report each phase as: Implemented / Tests / Architectural changes / Remaining / Risks. Never claim completion with acceptance unmet.
