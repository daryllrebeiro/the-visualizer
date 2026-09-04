# TheVisualizer — Modernization, UX & Hardening Master Plan

**Repo:** `daryllrebeiro/the-visualizer`
**Stack:** pnpm monorepo · Turborepo · Next.js 15 (`apps/web`) · Hono REST API (`apps/api`) · stateful WS gateway (`apps/ws-gateway`) · deterministic simulation engine (`packages/simulation`) · Zod contracts (`packages/contracts`) · Pino/OpenTelemetry logging (`packages/logging`) · Redis + Postgres · Docker Compose / Cloud Build / Cloud Run.
**Scope:** all 8 domain visualizers — Kafka, Raft, Distributed DB, Redis, Kubernetes, RabbitMQ, Storage Engine, TCP Networking.

---

## Status of prior work (what this plan builds on)

| Item                                                                 | Status  | Where it lives                                                                                                   |
| -------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------- |
| `DomainPlugin` interface & `DomainRegistry`                          | ✅ Done | [`registry.ts`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/packages/simulation/src/domains/registry.ts) |
| 8 domain reducers, invariant checkers, scenarios                     | ✅ Done | `packages/simulation/src/domains/*`                                                                              |
| 8 domain visualizer components                                       | ✅ Done | `apps/web/src/components/{raft,database,redis,...}`                                                              |
| Domain-parameterized fidelity tags                                   | ✅ Done | `DomainPluginMetadata.fidelityDisplayName`                                                                       |
| `OracleAdapter` interface                                            | ✅ Done | `oracle-harness.ts`                                                                                              |
| Single-domain room locking                                           | ✅ Done | `room-manager.ts` with `ERR_DOMAIN_LOCKED`                                                                       |
| Zod validation on all WS intents (including JOIN_ROOM, GAP_RECOVERY) | ✅ Done | `ws-server.ts` + `contracts/websocket/index.ts`                                                                  |
| Domain directory modal + domain switcher                             | ✅ Done | `DomainDirectoryModal.tsx`                                                                                       |
| CI pipeline (lint, typecheck, build, test)                           | ✅ Done | `.github/workflows/ci.yml`                                                                                       |
| Dockerfile (multi-stage, non-root user)                              | ✅ Done | `Dockerfile`                                                                                                     |
| Rate limiting (20 msg/sec free tier)                                 | ✅ Done | `ws-server.ts`                                                                                                   |

### What's NOT done yet (gaps this plan closes)

- No coverage reporting or determinism golden-state CI gate.
- No shared design system — each visualizer styles itself independently; `page.tsx` is a 2,751-line monolith.
- No command palette, no consistent inspector drawer, no unified timeline/scrubber.
- No Lighthouse/a11y baseline or budgets.
- No documented threat model.
- No fuzz testing or `fast-check` adversarial payload tests.
- No Playwright E2E or visual regression tests.
- No per-domain route code splitting (all 8 visualizers load in the same bundle).
- Magic numbers (16384 slots, M=4, 5 Raft nodes) hardcoded in UI components, not derived from simulation state.

---

## Guiding principles

1. **One shell, eight skins.** Same nav, typography, motion language, inspector drawer, chaos-control layout. Domain plugins differentiate canvas content and accent colors only.
2. **Novice-first, expert-capable.** 30 seconds to understanding via legends, tooltips, guided scenarios. SREs can bypass to raw chaos controls.
3. **Never trust the wire.** WS gateway and API assume untrusted callers. Validate→reject→log at every boundary.
4. **Determinism is the product.** Trace export/import and time-travel scrubbing must never regress. Golden-state CI gate enforces this.
5. **Reviewable slices.** Each phase = 1 PR stack, passes CI, is independently demoable.

---

## Phase 0 — Audit, Baseline & Guardrails

**Goal:** Safety net before anything else moves. Measure what we have, lock down what must not drift.

### Tasks

| #   | Task                                                                                                                                                                                                                              | Output artifact                     | Touches      |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ------------ |
| 0.1 | Run `pnpm build && pnpm test` across monorepo, record pass/fail/coverage per package                                                                                                                                              | `docs/audit/BASELINE.md`            | CI config    |
| 0.2 | Wire `vitest --coverage` into CI; publish coverage badge per package                                                                                                                                                              | `vitest.config.ts`, `ci.yml`        | Root config  |
| 0.3 | **Golden determinism fixtures**: for each of 8 domains, seed RNG, apply a fixed 50-event sequence, hash final state. Store as `.snap` fixtures in `packages/test-utils/golden/`. Wire `pnpm test:determinism` as required CI job. | `packages/test-utils/golden/*.snap` | New CI job   |
| 0.4 | Lighthouse audit (performance + a11y) on all 8 routes; log baseline scores                                                                                                                                                        | `docs/audit/BASELINE.md`            | —            |
| 0.5 | `next build` bundle analysis per route; record sizes                                                                                                                                                                              | `docs/audit/BASELINE.md`            | —            |
| 0.6 | Threat model: enumerate every inbound message type in `ws-server.ts` and `apps/api`, every SSRF vector, auth/rate-limit gaps                                                                                                      | `docs/security/THREAT_MODEL.md`     | —            |
| 0.7 | Magic-number inventory: grep for hardcoded domain constants (16384, M=4, 5 nodes, etc.) in `apps/web`; classify as configurable vs. protocol-fixed                                                                                | Section in `BASELINE.md`            | —            |
| 0.8 | Dependency audit: `pnpm audit`, check Dockerfile base image pinning (currently `node:22-alpine`, should be digest-pinned), flag any high/critical CVEs                                                                            | `docs/security/DEPENDENCY_AUDIT.md` | `Dockerfile` |

### Acceptance criteria

- `pnpm test:determinism` required in CI, fails on any state hash drift.
- `docs/security/THREAT_MODEL.md`, `docs/audit/BASELINE.md` committed.
- Coverage badge visible in `README.md`.

---

## Phase 1 — Shared Design System & Application Shell

**Goal:** Extract the UI foundation so all 8 domains inherit consistent look and feel by default.

### Why this matters now

[`page.tsx`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/apps/web/src/app/page.tsx) is 2,751 lines. Each domain visualizer manages its own layout, controls, and styling independently. Adding polish to one domain doesn't propagate to the others. This phase inverts that — build the shell once, domain plugins slot into it.

### Tasks

**1.1 — Design tokens & primitives** (`packages/ui` already exists in the workspace)

- CSS custom properties: color scales (light/dark + per-domain accents from `registry.ts` `color` field), spacing, radii, shadows, motion durations/easings.
- Typography: Inter variable for UI, JetBrains Mono for state/log/hex data. No unstyled browser defaults.
- Primitives: Button, IconButton, Badge/StatusPill, Tooltip, Popover, Drawer/Sheet, Modal, Tabs, Toast, Slider, Toggle, Select, Card, EmptyState, Skeleton, ProgressRing/Gauge.

**1.2 — `CanvasShell` layout component**

- Top nav: domain switcher dropdown (reads `DomainRegistry.list()`) + ⌘K command palette trigger.
- Left rail: collapsible chaos controls / scenario picker.
- Center: domain canvas (slot for domain-specific visualizer component).
- Right: inspector drawer (entity click → Overview / Live State / History / Actions tabs).
- Bottom: timeline/scrubber bar (shared component, already partially implemented).

**1.3 — Route restructuring**

- Move from monolith `page.tsx` to per-domain routes under `apps/web/src/app/[domain]/page.tsx` (directory already exists but barely used).
- Each route lazy-loads only its domain visualizer + simulation logic → automatic code splitting.
- Root `/` shows domain directory (replaces modal, becomes a proper landing page).

**1.4 — Command palette** (`⌘K` / `Ctrl+K`)

- Jump to domain, run chaos action, load scenario, toggle theme, import/export trace.
- Data source: `DomainRegistry.list()` + current domain's `scenarioLibrary`.

**1.5 — Motion system**

- Standardize transitions: node state changes (150ms ease-out), particle travel (bezier), drawer open/close (200ms spring), page transitions (fade-slide 150ms).
- Replace one-off CSS animations currently scattered across domain components.

**1.6 — Responsive breakpoints**

- Desktop: full shell. Tablet: collapsible side panels. Mobile: read-only "best on desktop" banner + simplified view.

### Acceptance criteria

- `/design-system` route renders every primitive in light + dark themes.
- Kafka domain fully migrated onto new shell as reference implementation.
- `page.tsx` reduced from 2,751 lines to under 200 (a thin router).
- Bundle size per domain route measurably smaller than Phase 0 baseline (code splitting).

---

## Phase 2 — Per-Domain Visualizer UX Overhaul

**Goal:** Bring all 8 domains up to the same UX bar using the Phase 1 shell. One PR per domain.

### Common checklist (all 8 domains)

- [ ] **Legend**: persistent, collapsible, explains every color/shape/badge on canvas.
- [ ] **Guided scenarios**: scenario picker with description, "what you'll see," Run button, narration callouts at each tick.
- [ ] **Inspector drawer**: entity click → right drawer with Overview / Live State (JSON+table) / History (event log for this entity) / Actions (entity-scoped chaos).
- [ ] **Invariant panel**: always-visible panel listing domain invariants with live green/red status; click-through to exact violation tick/entity.
- [ ] **Timeline/scrubber**: play/pause, step ±1, speed 1x/2x/4x, jump-to-violation, export/import trace. Shared component from Phase 1.
- [ ] **Empty/loading/error states**: skeleton while connecting, reconnect UI on WS drop, "invariant violated — view snapshot / reset" banner.
- [ ] **Canvas search/filter**: for high-entity-count domains (Redis slots, K8s pods), filter + zoom-to-entity.
- [ ] **Copy/share**: "copy state JSON," "download canvas PNG/SVG."
- [ ] **Keyboard**: arrow keys for timeline, `/` for search, `Esc` to close drawers, tab-navigable chaos controls.

### Domain-specific upgrades

| Domain         | Flagship upgrade                                                                                           | Secondary upgrades                                                                                |
| -------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **Kafka**      | Murmur2 hash playground with step-by-step byte breakdown (syntax-highlighted computation, not just result) | ISR shrink/grow animation with "why" tooltip; consumer rebalance before/after diff view           |
| **Raft**       | Election timeout as visible radial timers per node (the most-requested Raft visualization)                 | Draggable network-partition divider (not just multi-select); log matrix "why not committed" hover |
| **Database**   | Hovering a key → animated replica-placement path with running R/W ack tally                                | Side-by-side consistency-level comparison mode (ONE vs QUORUM vs ALL, same write)                 |
| **Redis**      | Zoomable slot minimap (16,384 slots can't be clicked at 1:1)                                               | Eviction pipeline showing ranked candidates by policy with "why this one"                         |
| **Kubernetes** | Scrubbable reconciliation loop (Observe→Diff→Act) with actual diff payload                                 | "Why is this pod Pending" inline on pod badge (resource shortfall, taint mismatch)                |
| **RabbitMQ**   | Interactive topic wildcard matcher (type routing key + binding, get live token-by-token match)             | DLQ rejection reason as filterable field (TTL expired vs nack'd vs unroutable)                    |
| **Storage**    | Synchronized B+Tree/LSM dual mode: same workload, both engines, compare write-amp/read paths               | Bloom filter bit-array visualization with live false-positive-rate counter                        |
| **TCP**        | AIMD curve with "no loss" ghost trace overlay for comparison                                               | Sliding window with sequence-number labels on hover; click-to-drop chaos                          |

### Acceptance criteria per domain

- Passes the common checklist (automated via shared Playwright script: open legend → run scenario → click entity → open drawer → scrub timeline → export trace, run against all 8 routes).
- Golden-state determinism tests still pass (UI changes must not touch simulation reducers).

---

## Phase 3 — Cross-Cutting UX, Accessibility & Onboarding

**Goal:** Genuinely friendly to first-time users; WCAG 2.1 AA compliant.

### Tasks

- [ ] **Onboarding tour**: first-run interactive walkthrough using Kafka domain — open inspector, run scenario, read invariant panel.
- [ ] **Progressive disclosure**: default "Guided" mode with scenario buttons front-center; "Advanced" toggle reveals raw chaos controls.
- [ ] **Contextual help**: every protocol term (ISR, LSO, cwnd, vnode, etc.) gets inline `?` with plain-English paragraph — sourced from `VISUALIZERS_DETAILS.md`.
- [ ] **Accessibility**:
  - Data-table view toggle for canvas content (screen reader alternative to SVG/Canvas).
  - Color never sole signal — every status gets paired icon or text label.
  - Full keyboard navigation audited with VoiceOver/NVDA.
  - Contrast checked against both themes.
- [ ] **i18n scaffolding**: extract all UI strings into a translation-ready format (even if only English ships).
- [ ] **Error messaging**: replace generic errors with domain-aware, actionable copy ("Lost connection to simulation gateway — reconnecting… [Retry now]").
- [ ] **Perceived performance**: skeleton loaders matching final layout shape; optimistic UI for chaos actions.

### Acceptance criteria

- Lighthouse a11y ≥ 95 on all 8 routes.
- Screen-reader walkthrough documented with issues resolved or ticketed.

---

## Phase 4 — Security Hardening

**Goal:** Safe for public multi-tenant exposure. Closes gaps from Phase 0 threat model.

### Tasks

| #    | Task                                                                                                                                                             | Current state → Target                                              |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 4.1  | **Fuzz testing**: `fast-check` adversarial payloads against every WS message type and REST endpoint; assert graceful rejection                                   | No fuzz tests → fuzz suite in CI                                    |
| 4.2  | **SSRF review**: test gateway SSRF validation against RFC1918, link-local, `0.0.0.0`, IPv6, DNS-rebinding bypasses                                               | Partial validation → automated bypass test suite                    |
| 4.3  | **AuthN/AuthZ**: audit JWT flow; add session-ownership checks so client A can't read/mutate client B's simulation via guessed ID                                 | Basic auth → session-scoped validation                              |
| 4.4  | **Rate limiting depth**: verify 20 msg/sec is per-identity AND per-IP; add global circuit breaker for connection floods; exponential backoff in client reconnect | Per-socket only → layered defense                                   |
| 4.5  | **Resource-exhaustion caps**: max cluster size, max trace history length, max concurrent sessions/user, max auto-produce cadence                                 | Some caps → comprehensive, configurable limits in `packages/config` |
| 4.6  | **Supply chain**: Dependabot/Renovate + `pnpm audit` as required CI check; pin Docker base by digest; add SBOM (Syft)                                            | `node:22-alpine` unpinned → digest-pinned + SBOM                    |
| 4.7  | **Secrets hygiene**: gitleaks/truffleHog in CI; verify `.env.example` has no real credentials                                                                    | No scanning → CI-required scan                                      |
| 4.8  | **Security headers**: strict CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, HSTS on `apps/web`                                             | None → full header suite                                            |
| 4.9  | **WS hardening**: `Origin` allow-list, message size cap, per-connection-per-second cap independent of app-level limiter                                          | Partial → layered WS defense                                        |
| 4.10 | **Container hardening**: read-only root filesystem, drop capabilities, Trivy scan in CI                                                                          | Non-root user done → full CIS benchmark pass                        |
| 4.11 | **Data at rest**: TLS on Postgres/Redis connections; scrub infra details from exported traces                                                                    | Unchecked → verified                                                |

### Acceptance criteria

- All Phase 0 threat-model items have resolved or documented accepted-risk status.
- CI blocks on: dependency vulnerabilities, secret scanning hits, fuzz test failures.

---

## Phase 5 — Reliability, Resilience & Observability

**Goal:** The platform should behave like the well-run systems it simulates.

### Tasks

- [ ] **Error boundaries**: per-domain React error boundaries with fallback UI ("report issue" pre-filled with session context, scrubbed of secrets).
- [ ] **Session resumption**: client reconnects → rehydrates from last known tick, not full state loss. Already partially there with `GAP_RECOVERY`; formalize and test.
- [ ] **Structured logging audit**: verify Pino + OTel traces cover full path (client action → gateway → reducer → broadcast) with correlation IDs; no PII logged.
- [ ] **Dashboards**: Grafana templates for connection counts, msg throughput, invariant-violation rate, p95/p99 latency. Link from `HOSTING_GUIDE.md`.
- [ ] **Load testing**: k6 scripts simulating 200+ concurrent WS sessions across domains with auto-produce/chaos loops for 30+ minutes; capture memory-growth graphs.
- [ ] **Platform chaos testing**: script gateway kills, Redis/Postgres failovers, web↔gateway network partitions in staging; verify clean "reconnecting" UX, no silent data loss.
- [ ] **Graceful shutdown**: `ws-gateway` drains in-flight sessions and persists state on SIGTERM (relevant for Cloud Run rolling deploys).

### Acceptance criteria

- Load test: 200 concurrent sessions, stable memory/latency for 30 minutes.
- Documented chaos-test results for gateway crash, Redis failover, Postgres failover.

---

## Phase 6 — Testing & Quality Gates

**Goal:** Automated regression net for everything above.

### Tasks

- [ ] **Unit coverage**: `packages/simulation` reducers + invariant verifiers to ≥ 90% (pure functions = highest ROI).
- [ ] **Contract tests**: `packages/contracts` schemas tested against valid + adversarial payloads (ties into Phase 4 fuzz suite).
- [ ] **Integration tests**: `apps/api` + `apps/ws-gateway` request/response flows including auth-failure and rate-limit paths.
- [ ] **E2E (Playwright)**: common-checklist interaction script from Phase 2 against all 8 domains + domain-specific flagship features.
- [ ] **Visual regression**: Chromatic/Playwright screenshots for representative states (steady-state, mid-chaos, invariant-violated, empty/loading) across all 8 domains.
- [ ] **a11y in CI**: axe-core as required gate, not manual audit.
- [ ] **Determinism suite**: Phase 0 golden fixtures formalized as permanent `pnpm test:determinism` job, covering all 8 domains with 3+ seeds each.
- [ ] **Cross-browser**: Playwright E2E on Chromium, Firefox, WebKit, one mobile viewport.

### Acceptance criteria

- All gates above required on `main`.
- Coverage trending upward from Phase 0 baseline.
- No flaky tests (>1% flake rate = quarantine and fix).

---

## Phase 7 — Performance Optimization

**Goal:** Modern UI polish must not cost responsiveness, especially for high-entity domains.

### Tasks

- [ ] Profile canvas rendering; virtualize/cull off-screen entities (especially Redis slot bar).
- [ ] Evaluate WebGL (`pixi.js`) for highest-entity views (Redis 16,384 slots, K8s pod grids) if SVG bottlenecks; keep SVG for low-density domains (accessibility).
- [ ] Per-domain code splitting confirmed (Phase 1 routing change) — measure TTI per route.
- [ ] Client-side: throttle WS state updates to `requestAnimationFrame` cadence; batch renders.
- [ ] Memoize expensive derived computations; offload heavy work (invariant checks, slot aggregation) to Web Workers.
- [ ] Re-run Lighthouse/bundle baselines, confirm improvement over Phase 0.

### Acceptance criteria

- Lighthouse perf ≥ Phase 0 baseline on all 8 routes.
- Before/after metrics (TTI, bundle size, FPS under load) in `docs/audit/PERFORMANCE_RESULTS.md`.

---

## Phase 8 — Documentation, Rollout & Handoff

### Tasks

- [ ] Update `README.md`, `HOW_TO_USE.md`, `VISUALIZERS_DETAILS.md`, `features_and_functionalities.md` with new UI screenshots/GIFs.
- [ ] `docs/design-system/README.md`: token system, component guidelines.
- [ ] `docs/security/HARDENING_SUMMARY.md`: Phase 4 changes for security review/compliance.
- [ ] Update `HOSTING_GUIDE.md` with observability dashboards and new env vars.
- [ ] `CHANGELOG.md` entry for the modernization effort.
- [ ] Staged rollout: domain-by-domain matching Phase 2 PR order; golden-state + E2E as go/no-go gate.

---

## Execution graph

```
Phase 0 ─── BLOCKING, DO FIRST ───────────────────────────────
   │
   ├─ Phase 1 (design system) ──────────────────────┐
   │                                                  │
   ├─ Phase 4 (security) ───── can start in parallel  ├── Phase 2 (per-domain UX, 8 parallel PRs)
   │                                                  │        │
   ├─ Phase 5 (reliability/observability) ────────────┘        │
   │                                                           ▼
   │                                                    Phase 3 (a11y/onboarding)
   │                                                           │
   └───────────────────────────────────────────────────────────┤
                                                               ▼
                                                        Phase 6 (testing — continuous, hardens as above lands)
                                                               │
                                                        Phase 7 (perf — after real UI exists)
                                                               │
                                                        Phase 8 (docs/rollout)
```

**Key parallel lanes:**

- **Lane A (frontend):** Phase 1 → Phase 2 → Phase 3 → Phase 7
- **Lane B (backend/security):** Phase 4 → Phase 5
- **Lane C (quality):** Phase 6 runs continuously alongside both lanes

Phases 1, 4, 5 can start simultaneously after Phase 0 — they touch different layers (design system, gateway security, observability). Phase 2 blocks on Phase 1's shell. Phase 6 tests accrue incrementally, not as a big-bang at the end.

---

## Relation to existing plans

| Existing document                                                                                                        | Relationship to this plan                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`TO_DO_PLANS.md`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/TO_DO_PLANS.md)                                   | Future integration roadmap (Raft/Paxos, DB, Redis, K8s) — orthogonal to this plan. This plan modernizes the _current_ 8 domains; `TO_DO_PLANS.md` adds _new_ domains. Cross-cutting platform work items (fidelity tags ✅, oracle adapter ✅, room scope ✅) are already done. Remaining item (domain directory/landing page) is Phase 1.3 here. |
| [`VISUALIZERS_DETAILS.md`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/VISUALIZERS_DETAILS.md)                   | Technical reference per domain — Phase 3's contextual help pulls `?` tooltip content from this. Phase 2's invariant panel uses the invariant IDs defined here.                                                                                                                                                                                   |
| [`IMPLEMENTATION_PLAN.md`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/IMPLEMENTATION_PLAN.md)                   | Original build plan — now historical. This document supersedes it for modernization scope.                                                                                                                                                                                                                                                       |
| [`features_and_functionalities.md`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/features_and_functionalities.md) | Feature inventory — Phase 8 updates it to reflect modernized state.                                                                                                                                                                                                                                                                              |

---

## How to use this as agent prompt

When slicing a phase for a coding agent:

1. Reference phase + task numbers verbatim.
2. Point at the relevant `apps/*` or `packages/*` directory.
3. Require `pnpm test:determinism` before and after every change.
4. Forbid `packages/simulation` reducer modifications when the task is UI-only (Phases 1–3, 7).
5. Each PR maps to one checklist cluster with acceptance criteria in the PR description.

---

## Next Horizon: Modern AI Infrastructure Expansion (Domains 9–13)

With General Availability (GA) hardening complete and Scorecard V4 certified at 94/100, the platform is expanding to 13 domains to cover the modern Generative AI Infrastructure stack:

| Domain Key     | Subsystem                       | Focus Area                                                                  | Phased Milestone |
| :------------- | :------------------------------ | :-------------------------------------------------------------------------- | :--------------: |
| `/rag`         | Retrieval-Augmented Generation  | Chunking, hybrid BM25/vector search, cross-encoder re-ranking               | Phase N.1 - N.6  |
| `/agents`      | Multi-Agent Orchestration & MCP | ReAct loops, Model Context Protocol tools, hierarchical supervision         | Phase N.1 - N.6  |
| `/llm-serving` | LLM Inference & PagedAttention  | Virtual KV-cache block allocator, continuous batching, speculative decoding | Phase N.1 - N.6  |
| `/vectordb`    | Vector DB & ANN Search          | Multi-layer HNSW graphs, IVF-PQ quantization, greedy beam routing           | Phase N.1 - N.6  |
| `/gpu-cluster` | GPU Scheduling & 3D Parallelism | 1F1B pipeline schedule, Tensor Parallelism, DeepSpeed ZeRO-3 sharding       | Phase N.1 - N.6  |

_See full architectural specifications, invariants, and phased implementation schedule in [`docs/architecture/AI_INFRA_EXPANSION_PLAN.md`](file:///c:/Users/Lenovo%20Laptop/dev/the-visualizer/docs/architecture/AI_INFRA_EXPANSION_PLAN.md)._
