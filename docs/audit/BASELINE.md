# TheVisualizer — Audit Baseline

Captured: 2026-09-02

---

## Build Status

| Package | Status |
|---|---|
| `packages/contracts` | ✅ Pass |
| `packages/logging` | ✅ Pass |
| `packages/ui` | ✅ Pass |
| `packages/config` | ✅ Pass |
| `packages/test-utils` | ✅ Pass |
| `packages/simulation` | ✅ Pass |
| `apps/api` | ✅ Pass |
| `apps/ws-gateway` | ✅ Pass |
| `apps/web` (Next.js) | ✅ Pass |

---

## Test Status

### `@the-visualizer/simulation` — 19 files, 99 tests ✅
| Test file | Tests | Status |
|---|---|---|
| `cluster-full-lifecycle.test.ts` | 1 | ✅ |
| `simulation-engine.test.ts` | 9 | ✅ |
| `simulation-reconstitutor.test.ts` | 6 | ✅ |
| `raft-simulator.test.ts` | 4 | ✅ |
| `rabbitmq-simulator.test.ts` | 5 | ✅ |
| `db-simulator.test.ts` | 4 | ✅ |
| `invariant-checker.test.ts` | 7 | ✅ |
| `k8s-simulator.test.ts` | 5 | ✅ |
| `redis-simulator.test.ts` | 5 | ✅ |
| `golden-determinism.test.ts` | 18 | ✅ |
| `log-segment.test.ts` | 5 | ✅ |
| `partition-log.test.ts` | 6 | ✅ |
| `networking-simulator.test.ts` | 3 | ✅ |
| `txn-coordinator.test.ts` | 4 | ✅ |
| `storage-simulator.test.ts` | 3 | ✅ |
| `murmur2.test.ts` | 5 | ✅ |
| `deterministic-rng.test.ts` | 4 | ✅ |
| `virtual-timeline.test.ts` | 2 | ✅ |
| `oracle-harness.test.ts` | 3 | ✅ |

### `@the-visualizer/web` — 4 files, 14 tests ✅
| Test file | Tests | Status |
|---|---|---|
| `EntityInspector.test.ts` | 5 | ✅ |
| `ScenarioRunner.test.ts` | 4 | ✅ |
| `event-replay.test.ts` | 3 | ✅ |
| `reconnection-pulse.test.ts` | 2 | ✅ |

### `@the-visualizer/ws-gateway` — 5 files, 7 tests (4 suites need env vars)
| Test file | Tests | Status | Notes |
|---|---|---|---|
| `ssrf.test.ts` | 7 | ✅ | |
| `runner.test.ts` | 0 | ❌ | Needs `REDIS_URL`, `SESSION_SECRET` |
| `e2e-gateway-lifecycle.test.ts` | 0 | ❌ | Needs `REDIS_URL`, `SESSION_SECRET` |
| `ws-server.test.ts` | 0 | ❌ | Needs `REDIS_URL`, `SESSION_SECRET` |
| `room-manager.test.ts` | 0 | ❌ | Needs `REDIS_URL`, `SESSION_SECRET` |

> **Action item:** Gateway tests should use test-env defaults or mocks so they run without live Redis.

---

## Bundle Size Baseline (Next.js production build)

| Route | Size | First Load JS |
|---|---|---|
| `/` (root) | 162 B | 200 kB |
| `/[domain]` (all 8 domains) | 161 B | 200 kB |
| `/_not-found` | 996 B | 103 kB |

### Shared chunks
| Chunk | Size |
|---|---|
| `482-*.js` | 45.7 kB |
| `da82b1fc-*.js` | 54.2 kB |
| Other shared | 1.96 kB |
| **Total shared** | **102 kB** |

> **Key observation:** All 8 domain routes share the same 200 kB First Load JS — no per-domain code splitting exists. Phase 1 route restructuring should yield measurable improvement.

---

## Determinism Status

| Domain | Deterministic | Notes |
|---|---|---|
| Kafka | ✅ | |
| Raft | ✅ | |
| Database | ✅ | |
| Redis | ✅ | |
| Kubernetes | ✅ | Fixed: `Math.random()` in pod name generation replaced with tick-based deterministic suffix |
| RabbitMQ | ✅ | |
| Storage | ✅ | |
| Networking | ✅ | |

> **Bug found and fixed:** `k8s-reconciliation.ts` line 64 used `Math.random().toString(36)` for pod name generation, bypassing `DeterministicRNG`. Replaced with `${state.tick}-${index}` pattern.

---

## Magic Number Inventory

| Constant | Value | Location | Configurable? |
|---|---|---|---|
| Redis hash slots | 16,384 | `redis-types.ts`, `RedisClusterVisualizer.tsx` | Protocol-fixed (Redis spec) |
| Raft default nodes | 5 | `raft-state-transitions.ts` | Configurable via `createDefaultRaftCluster()` param |
| B+Tree order (M) | 4 | `storage-types.ts` | Hardcoded in type definition |
| K8s worker nodes | 3 | `k8s-state-transitions.ts` | Hardcoded in `createDefaultK8sCluster()` |
| K8s CPU capacity | 2000m | `k8s-state-transitions.ts` | Hardcoded per node |
| K8s memory capacity | 2048 MB | `k8s-state-transitions.ts` | Hardcoded per node |
| DB replication factor | 3 | `db-state-transitions.ts` | Configurable via state |
| Rate limit | 20 msg/sec | `ws-server.ts` | Hardcoded |
| Max message size (WS) | 1 MB (Kafka value field) | `contracts/websocket/index.ts` | Zod schema constraint |
| Max topic name | 249 chars | `contracts/websocket/index.ts` | Kafka protocol limit |
| Heartbeat interval | 10s | `ws-server.ts` | Hardcoded |

---

## Coverage Baseline

Coverage reporting not yet configured. **Phase 0 action:** add `vitest --coverage` configuration.

---

## Accessibility Baseline

Not yet audited. Requires running Lighthouse against deployed or local instance.

---

## CI Pipeline Status

| Job | Status |
|---|---|
| Install & Cache | ✅ |
| Lint & Format | ✅ |
| TypeScript Check | ✅ |
| Unit Tests | ✅ |
| **Golden Determinism Gate** | ✅ (newly added) |
| Secret Scanning (TruffleHog) | ✅ (already existed) |
| Integration Tests | ⚠️ Needs Redis/Postgres services |
| Build All | ✅ |
| Docker Build | ✅ |
