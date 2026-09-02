# TheVisualizer Production Runbook

Operational procedures, incident playbooks, deployment protocols, and SLO runbooks.

---

## 1. Architecture Overview & Services

| Service | Technology | Port / URL | Deployment Target |
|---|---|---|---|
| **Web Frontend** (`apps/web`) | Next.js 15 Standalone | 3000 / `https://the-visualizer-*.run.app` | Google Cloud Run |
| **Stateful WS Gateway** (`apps/ws-gateway`) | Node.js `ws` + Redis PubSub | 8080 | Google Cloud Run (Session Affinity enabled) |
| **REST API** (`apps/api`) | Hono | 3001 | Google Cloud Run |
| **State Store** | Redis (Cluster / Sentinel) | 6379 | Managed Redis / VPC |
| **Data Store** | PostgreSQL 16 | 5432 | Cloud SQL PostgreSQL |

---

## 2. Deployment Procedures

### Automated Deployment (Cloud Build / CI)
Pushes to `main` trigger `.github/workflows/ci.yml`. Once all quality gates (Lint, Typecheck, Golden Determinism, Unit Tests, Security Audit) pass, containers are built and deployed via Cloud Run.

### Manual Fast-Rollout Script
```bash
./scripts/pull-and-deploy.sh
```

---

## 3. Incident Playbooks & Troubleshooting

### Incident A: WebSocket Gateway Client Disconnect Storm
**Symptoms**: High reconnection rate on Grafana dashboard, `DISCONNECTED` status pills on frontend.
**Resolution**:
1. Check Cloud Run instance CPU/Memory utilization.
2. Verify Redis Pub/Sub connectivity (`REDIS_URL`).
3. Check `ws-gateway` connection limits. Ensure Cloud Run `max-concurrency` is set to 250+.
4. Trigger rolling restart of `ws-gateway` instances.

### Incident B: Non-Deterministic Simulation Invariant Failure
**Symptoms**: `MSG_INVARIANT_VIOLATION` alert emitted on canvas.
**Resolution**:
1. Click **Export Trace** from the UI to download the failing `SimTraceBundle.json`.
2. Run trace locally via CLI:
   ```bash
   node scripts/sim-cli.mjs --domain=<domain> --seed=<seed> --ticks=<ticks>
   ```
3. Run determinism suite to isolate regression:
   ```bash
   pnpm test:determinism
   ```

---

## 4. Disaster Recovery & Redis Maintenance

- **Redis Snapshot Restoration**:
  The WS Gateway is stateless regarding long-term storage; simulation room states are recreated on-demand or snapshot-reconstituted. If Redis restarts, connected clients automatically request a full state resync via `GAP_RECOVERY` or `JOIN_ROOM`.
