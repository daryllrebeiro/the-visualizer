# TheVisualizer Platform — Threat Model

**Status:** Phase 0 Baseline  
**Scope:** `apps/api` (Hono REST API), `apps/ws-gateway` (WebSocket Realtime Server), and `@the-visualizer/simulation` (DDES Engine Core).

---

## 1. System Architecture & Trust Boundaries

```
[ Untrusted Internet Client ]
          │
          │ HTTPS / WSS
          ▼
┌─────────────────────────────────────────────────────────┐
│ Boundary 1: Ingress / Gateway                           │
│ - Origin verification & TLS termination                 │
│ - JWT / Session Token verification                      │
│ - Token-bucket rate limiting (20 msg/s free, 250 hard) │
│ - Zod schema contract validation                        │
└──────────────────────────┬──────────────────────────────┘
                           │ Validated In-Memory Intents
                           ▼
┌─────────────────────────────────────────────────────────┐
│ Boundary 2: Simulation Execution Layer                  │
│ - RoomManager / SimulationRunner (Single-domain rooms)  │
│ - Pure Reducer transitions (zero network/disk I/O)      │
│ - Continuous Safety Invariant Checks                    │
│ - State delta patching (JSON Patch RFC 6902)            │
└──────────────────────────┬──────────────────────────────┘
                           │ State Sync & Persistence
                           ▼
┌─────────────────────────────────────────────────────────┐
│ Boundary 3: Infrastructure / Datastores                 │
│ - Redis: Pub/Sub intent queues & ephemeral session state │
│ - Postgres: Topologies, user orgs, audit history        │
│ - OpenTelemetry / Pino: Metrics and structured logging  │
└─────────────────────────────────────────────────────────┘
```

---

## 2. Inbound Message & Endpoint Inventory

### WebSocket Gateway (`apps/ws-gateway`)

| Message Type            | Direction       | Payload Contract          | Validation Status     | Risk Level                        |
| ----------------------- | --------------- | ------------------------- | --------------------- | --------------------------------- |
| `JOIN_ROOM`             | Client → Server | `IntentJoinRoomSchema`    | ✅ Strict Zod parsing | Medium (Room exhaustion)          |
| `GAP_RECOVERY`          | Client → Server | `IntentGapRecoverySchema` | ✅ Strict Zod parsing | Low (Replay range validation)     |
| `PRODUCE_RECORD`        | Client → Server | `ClientIntentSchema`      | ✅ Strict Zod parsing | Medium (Payload size memory DOS)  |
| `BROKER_CRASH`          | Client → Server | `ClientIntentSchema`      | ✅ Strict Zod parsing | Low (Simulated state change only) |
| `CONSUMER_SUBSCRIBE`    | Client → Server | `ClientIntentSchema`      | ✅ Strict Zod parsing | Low                               |
| `STEP_FORWARD` / `BACK` | Client → Server | `ClientIntentSchema`      | ✅ Strict Zod parsing | Low                               |
| `TOPOLOGY_SNAPSHOT`     | Server → Client | `TopologySnapshotSchema`  | Server generated      | Low                               |
| `EVENT_EMITTED`         | Server → Client | `SimEventSchema`          | Server generated      | Low                               |
| `INVARIANT_VIOLATED`    | Server → Client | `ViolationSchema`         | Server generated      | Low                               |

### REST API (`apps/api`)

| Endpoint          | Method        | Auth Required | Rate Limited | SSRF Risk          |
| ----------------- | ------------- | ------------- | ------------ | ------------------ |
| `/health`         | `GET`         | No            | Yes (60/min) | None               |
| `/metrics`        | `GET`         | No (Internal) | Yes (60/min) | None               |
| `/auth/login`     | `POST`        | No            | Yes (10/min) | None               |
| `/auth/register`  | `POST`        | No            | Yes (5/min)  | None               |
| `/topologies`     | `GET`         | Yes           | Yes (60/min) | None               |
| `/topologies`     | `POST`        | Yes           | Yes (30/min) | Low (JSON storage) |
| `/topologies/:id` | `GET/PUT/DEL` | Yes           | Yes (60/min) | None               |
| `/orgs`           | `GET/POST`    | Yes           | Yes (30/min) | None               |

---

## 3. Threat Classification & Mitigations (STRIDE)

### A. Spoofing

- **Threat:** Malicious client forging user identity or impersonating another room participant.
- **Current Mitigation:** Cryptographic JWT token verification with HMAC-SHA256 / Ed25519 signing. Tokens must contain valid `sub` and `sessionId`.
- **Target Gap (Phase 4):** Ensure simulation room ownership verification so user A cannot mutate user B's active simulation room by guessing room IDs.

### B. Tampering

- **Threat:** Injecting malformed intents to corrupt simulation memory or crash the worker process.
- **Current Mitigation:** Zod schemas (`IntentJoinRoomSchema`, `ClientIntentSchema`, etc.) validate all inbound messages before passing to reducers. Invalid payloads emit `ERR_BAD_REQUEST` and are dropped.
- **Target Gap (Phase 4):** Add property-based fuzz tests (`fast-check`) on all contracts.

### C. Repudiation

- **Threat:** Client triggers malicious chaos or data actions without traceability.
- **Current Mitigation:** All operations emit structured Pino logs with correlation IDs, `userId`, and `clientIp`. OpenTelemetry traces full intent execution pipeline.

### D. Information Disclosure

- **Threat:** Leaking internal infrastructure hostnames, database connection strings, or user credentials in error messages or exported JSON traces.
- **Current Mitigation:** Generic error messages in production mode (`app.onError`).
- **Target Gap (Phase 4):** Scrub any infrastructure metadata (IPs/hostnames) from exported JSON traces.

### E. Denial of Service (DoS) / Resource Exhaustion

- **Threat:**
  1. Connection flooding to exhaust gateway sockets.
  2. Auto-produce loop with huge payloads to exhaust memory.
  3. Memory explosion via unbounded trace history buffers.
- **Current Mitigation:**
  - Double token-bucket rate limiter: 20 msg/s (free tier) + 250 msg/s (hard kill limit).
  - Maximum payload size constraints on record values (1 MB limit in Zod contracts).
- **Target Gap (Phase 4):** Add hard limits on cluster node count, max concurrent rooms per user, and sliding window buffer trimming on historical trace frames.

### F. Elevation of Privilege / SSRF

- **Threat:** External network connection attempts triggered by visualizer configurations.
- **Current Mitigation:** `ssrf.test.ts` validates gateway subnet protections against private RFC1918 addresses, link-local, `0.0.0.0`, and IPv6 equivalents. `@the-visualizer/simulation` contains zero I/O packages.
- **Target Gap (Phase 4):** Enforce strict DNS-rebinding guards and test container network sandboxing.

---

## 4. Residual Risks & Action Items

| Item | Description                                            | Planned Phase | Priority |
| ---- | ------------------------------------------------------ | ------------- | -------- |
| TM-1 | Session ownership authorization checks for room access | Phase 4       | High     |
| TM-2 | Fuzzing boundary contracts with `fast-check`           | Phase 4       | High     |
| TM-3 | Enforce strict CORS and CSP headers on `apps/web`      | Phase 4       | Medium   |
| TM-4 | Digest-pin Docker base images in `Dockerfile`          | Phase 0/4     | Medium   |
| TM-5 | Container non-root execution and read-only rootfs      | Phase 4       | Medium   |
