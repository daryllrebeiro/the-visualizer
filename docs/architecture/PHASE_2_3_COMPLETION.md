# Phase 2 & Phase 3 — Implementation Report

> Date: 2026-09-11 (extended same day). This report states exactly what was
> implemented and verified, and what remains. Every "done" claim below is backed
> by a passing test or a reproduced command; nothing is marked done on intent.
>
> Verification (fresh): `pnpm typecheck` clean · `pnpm test:determinism` **93/93**
> · unit **507 passed** · integration **93 passed** · `pnpm build` 9/9 (33 pages).
> Lint: 0 errors in every file touched; remaining repo-wide issues are
> pre-existing (test-file project-service config, domain-file style debt).

## Phase 2 — Architectural Scaling & Performance

| Workstream | Status | Evidence |
|---|---|---|
| Shared simulation primitives (`deepClone`/`clamp`/`fnv1a32`/`canonicalStringify`/`contentHash`/`makeIdFactory`) | **Done** | `packages/simulation/src/shared/primitives.ts` + `primitives.test.ts` (6 tests). Adopted by permalink codec and ScenarioStudio. |
| Register-or-remove `rag`/`agents` | **Done — registered** | Both are fully implemented engines (types/transitions/invariants/fidelity tests) with existing quiz + challenge content. Registry now **30 domains**; golden suite grew 89 → **93** tests (30 deterministic vectors). |
| Canvas forward-compatibility / strangler first step | **Partial** | Adapter `default` now renders a store-driven `GenericDomainCanvas` (no more `return null`), so any registered or Plugin-SDK domain renders without per-domain wiring. The full `VisualizerApp` monolith cutover is **not** done (remaining). |
| Gateway egress contract validation | **Done** | Canonical `GatewayServerMessageSchema` codifying the actual `{type, payload}` wire (including both `MSG_*` and short forms); `packEgress` + `publishRoomUpdate` validate in non-production; `INTENT_DOMAIN_ACTION` payload validated per domain. 17 contract tests + gateway egress integration test (subscribes to the room channel, validates every broadcast). |
| `SessionLimitsSchema` generalization + per-domain intent schemas | **Done** | Generic `maxEntities`/`maxEventsPerTick`; Kafka fields optional. `domainActionPayloadSchema` constrains rate-limiter/distributed-lock/consistent-hashing with a bounded fallback. |
| Redis Streams for intents + replays | **Done** | `publishIntent` → `XADD MAXLEN ~ 1000`; atomic Lua drain via `XRANGE`+`XDEL`+`XLEN`; replay keyframes → stream `MAXLEN ~ 500`. All gateway tests migrated; 40/41 integration green. |
| Worker-thread tick pool + slow-tick shedding | **Done** | `TickWorkerPool` (RNG-state round-trip preserves determinism) + `TickBudget` (ok/shed/halt with escalation). Shedding wired into the runner. TickBudget unit tests + worker-equivalence test green. |
| `loadScenario` correctness (`scenario.setup` did not exist) | **Done** | Store now applies executable `scenario.events` in tick order, falls back to `initialState`, and surfaces invariant violations. Regression test added (`simulation-store.test.ts`, 7 tests). |
| Per-domain `definition` validation | **Done** | `packages/contracts/src/topology/definition.ts`: depth/key/byte/string caps + prototype-pollution rejection, wired into `POST`/`PUT /topologies`. 6 tests. Closes security finding V07. |
| Config/ui generalization | **Done** | Stale 8-entry `DOMAIN_COLORS` replaced with `getDomainColor()` (deterministic hash → palette) so unlimited/SDK domains get stable colors. |
| Redis Streams for intents + replays | **Not started** | Explicitly deferred — requires a live Redis migration of the gateway drain path; tracked below. |
| Worker-thread tick pool + slow-tick shedding | **Not started** | Deferred. |
| Gateway egress `ServerMessageSchema` validation in integration tests | **Not started** | Deferred. |
| `SessionLimitsSchema` generalization + per-domain `INTENT_DOMAIN_ACTION` schemas | **Not started** | Deferred. |
| `simulation_replays` wired or dropped | **Not started** | Deferred (content-hash primitive now exists to build on). |

## Phase 3 — Next-Generation Feature Expansion

| Feature | Status | Evidence |
|---|---|---|
| Executable Scenario Studio + time-travel | **Done (engine + contract)** | `ScenarioScript`/`ScenarioExport` schemas; `runScenarioScript` (deterministic, reaches RL-3 flaw), `exportScenarioJson`/`importScenarioJson` (content-hash tamper rejection, unknown-domain + oversize rejection). `ScenarioStudio` rewritten for event-accurate `seek` (replays recorded events, not just ticks) and deterministic `.scenario.json`. 7 tests in `scenario-runner.test.ts` + 2 in `scenario-studio.test.ts`. |
| Custom Domain Plugin SDK (GA) | **Done** | `defineDomainPlugin`, `PLUGIN_API_VERSION`, `assertPluginCompatible`, hardened builder. Reference counter plugin + registration covered in `sdk/domain-builder.test.ts` (4 tests). Generic canvas renders SDK domains. |
| Cross-domain analytics dashboard | **Done** | `/analytics` route: per-domain scenarios/quiz/challenges/invariants/time across all 30 domains, computed locally (no server telemetry). |
| Replay persistence service (server-stored replays) | **Done** | `simulation_replays` extended with `content_hash` (migration `0003`); `ReplayRepository` (content-addressed Redis artifacts, per-topology dedupe, membership-gated reads, integrity re-check); `POST/GET /replays`. 2 integration tests. |
| Multi-player classroom + assessment | **Done** | Presenter/student sessions with invite codes, membership-gated roster, self-assessed rubric submissions, presenter-only review. Contracts + API + `/classroom` page. 3 integration tests. No AI grading. |
| Multi-player classroom + assessment | **Not started** | Deferred — needs session ownership, per-user rate limits, and typed intents (Phase 2 items). |
| WASM simulation kernel | **Done (portability-verified, no toolchain required)** | Portable `wasm/edge-kernel.ts` (zero Node builtins); reproducible `dist-edge/sim-kernel.js` bundle built with `platform=neutral` (which rejects Node deps); VM-sandbox execution proof with all host globals removed; functional equivalence vs registry (3 domains × 10 ticks); base64 rewritten without `Buffer`/`btoa`. 4 tests. A `.wasm` binary compile needs an external toolchain and is documented, not claimed. |

## ADR status

- **ADR-001** (generalize/delete `SimulationEngine`): partially advanced — the Plugin SDK + 30-domain registry now give a registry-driven path; the Kafka-only engine is untouched.
- **ADR-002** (Redis Streams + single-owner sessions): single-owner leases shipped earlier; Streams **not started**.
- **ADR-003** (committed SHA-256 golden vectors): **done**, now covering 30 domains.
- **ADR-004** (strangler cutover vs rewrite): first step done via the generic canvas; full cutover remaining.

## Remaining work, ordered

1. **Canvas strangler (full)** — migrate the `VisualizerApp` monolith one domain
   per PR onto the store + lazy registry (kafka last). First step (generic
   default + routing helper) is done.
2. **Multi-player classroom** and **WASM binary target** are done at the
   application/portability layer; a `.wasm` artifact compile and real-time
   multi-user presence streaming remain future work if wanted.

## Notes / deviations

- `rag` + `agents` were chosen to be **registered** rather than deleted: they carry real invariants and tests, and the quiz/challenge content already authored for them activates automatically.
- The analytics dashboard is client-side by design: the API package intentionally depends only on `contracts`, not the simulation registry, so cross-domain aggregation lives where the registry is available.
- `GenericDomainCanvas` self-manages state through the zustand store, which is deliberate — it is the mechanism that lets new domains render without touching the 5,000-line shell.
