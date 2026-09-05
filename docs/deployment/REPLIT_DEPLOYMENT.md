# Replit Production Deployment Guide

Production deployment runbook and architecture specification for **TheVisualizer** monorepo on Replit.

---

## 1. Capabilities & Constraints Audit

| Dimension | Replit Capability / Limit | Adaptation in TheVisualizer |
|---|---|---|
| **Runtime Target** | Reserved VM (`deploymentTarget = "vm"` in `.replit`) | Multi-process supervisor (`scripts/replit-supervisor.mjs`) manages Next.js, Hono API, and WebSocket Gateway within a single VM instance. |
| **Package Management** | Nix environment (`replit.nix`) pinning Node.js 20, pnpm, OpenSSL, curl, git | Pinned `pkgs.nodejs_20` and `pkgs.pnpm` ensures reproducible, deterministic installs matching local dev. |
| **Port Exposure** | Single public port routing (`localPort = 8080`, `externalPort = 80`) | Internal zero-dependency Node.js reverse proxy (`scripts/replit-reverse-proxy.mjs`) binds `0.0.0.0:8080` and multiplexes all inbound traffic. |
| **WebSocket Support** | HTTP Upgrade / Duplex socket piping supported through Replit edge proxy | Reverse proxy hooks HTTP `'upgrade'` events, multiplexes `/ws` paths to `localhost:3001` via raw duplex socket piping (`net.connect`). |
| **Health Checks** | Replit deployment health monitoring | Proxy exposes dedicated `/deployment-health` endpoint returning `200 OK` with uptime and memory metrics. |
| **Database** | Replit Managed PostgreSQL (`DATABASE_URL`) or external Postgres | Native support for standard connection strings via `DATABASE_URL` or `POSTGRES_URL`. |
| **Cache & State (Redis)** | **No Replit-managed Redis** | External managed Redis required: Upstash Redis or Redis Cloud via `REDIS_URL` (`rediss://...`). |
| **Secrets Management** | Replit Secrets (encrypted environment variables injected at runtime) | All credentials (`JWT_SECRET`, `REDIS_URL`, `DATABASE_URL`, `ADMIN_TOKEN`) are configured via Replit Secrets. |
| **CLI Deployment** | No public Replit deploy CLI; deployments trigger via Git or Replit UI | Deterministic pre-flight deployment script (`scripts/deploy-replit.mjs`) guarantees clean builds and tests prior to Git push. |

---

## 2. Architecture: Single Reserved VM with Internal Reverse Proxy (Option A)

### Topology Diagram

```
                        [ Internet / Client Browser ]
                                     |
                                     | HTTPS / WSS (Port 443)
                                     v
                       [ Replit Edge Router & TLS ]
                                     |
                                     | HTTP / WS (Port 80 -> 8080)
                                     v
+-------------------------------------------------------------------------+
| Replit Reserved VM                                                      |
|                                                                         |
|   +-----------------------------------------------------------------+   |
|   |          Internal Reverse Proxy (:8080)                        |   |
|   |          (scripts/replit-reverse-proxy.mjs)                     |   |
|   +-----------------------------------------------------------------+   |
|         |                     |                    |            |       |
|         | /deployment-health  | /api/*             | /ws        | /*    |
|         v                     v                    v            v       |
|   [ Health Check ]     [ API Service ]     [ WS Gateway ]  [ Next.js ] |
|   (Returns 200 OK)     (Hono REST :3000)   (WS :3001)      (Web :3002) |
|                              |                    |                     |
+------------------------------|--------------------|---------------------+
                               |                    |
                               v                    v
                   +------------------+   +-------------------+
                   | Postgres DB      |   | Upstash Redis     |
                   | (Replit/Supabase)|   | (Token Revocation)|
                   +------------------+   +-------------------+
```

### Ingress Routing Rules

| Path | Destination | Protocol | Purpose |
|---|---|---|---|
| `/deployment-health` | Proxy Builtin | HTTP | VM liveness & deployment verification probe. |
| `/api/*` | `http://127.0.0.1:3000` | HTTP | Hono REST API, authentication, health, metrics. |
| `/ws` | `http://127.0.0.1:3001` | WebSocket (Upgrade) | Real-time simulation event stream & bi-directional sync. |
| `/*` (All remaining) | `http://127.0.0.1:3002` | HTTP | Next.js visualizer web frontend. |

### Topology Rationale
1. **Single Origin & No CORS Drift**: Because Web, REST API, and WebSocket server reside behind `https://your-domain.replit.app`, browser clients make same-origin requests.
2. **WebSocket Persistence**: Reserved VM ensures long-lived duplex TCP connections without cold-start disconnections common in serverless environments.
3. **Port Compliance**: Fully complies with Replit's single-port limitation (`localPort = 8080`).

---

## 3. External Stateful Dependencies Setup

### 3.1 PostgreSQL Setup
Replit provides a built-in PostgreSQL database:
1. In your Repl, open the **Tools** sidebar and select **PostgreSQL**.
2. Click **Create a database**. Replit will populate the `DATABASE_URL` secret.
3. If using an external provider (Neon, Supabase, AWS RDS):
   - Set `DATABASE_URL=postgres://user:password@hostname:5432/the_visualizer?sslmode=require`.

### 3.2 Redis Setup (Upstash / Redis Cloud)
Replit does not provide native managed Redis. Use [Upstash](https://upstash.com) (free tier supported):
1. Sign up at [upstash.com](https://console.upstash.com) and create a Redis database.
2. Under **Connect to your database**, copy the `rediss://` connection URL.
3. In your Repl, navigate to **Secrets** (Lock icon).
4. Add secret:
   - Key: `REDIS_URL`
   - Value: `rediss://default:<password>@<endpoint>.upstash.io:6379`
5. Optional: Set `REDIS_PASSWORD` if your connection string requires a separate password.

---

## 4. Replit Secrets Reference Table

Configure the following key-value pairs in the Replit **Secrets** tool:

| Secret Key | Required | Default / Format | Description |
|---|---|---|---|
| `NODE_ENV` | Yes | `production` | Enables production optimizations across Next.js and API. |
| `JWT_SECRET` | Yes | `min-32-char-cryptographic-string` | Signs and verifies user authentication tokens. |
| `ADMIN_TOKEN` | Yes | `min-32-char-random-string` | Protects privileged simulation endpoints. |
| `REDIS_URL` | Yes | `rediss://default:pw@host:port` | Upstash/Redis connection string for token revocation & rate limiting. |
| `REDIS_PASSWORD` | Optional | String | Redis password if not encoded directly in `REDIS_URL`. |
| `DATABASE_URL` | Optional | `postgres://user:pw@host:port/db` | Database connection string. |
| `PORT` | Auto | `8080` | Managed by Replit; reverse proxy binds here. |
| `CORS_ORIGIN` | Optional | `https://your-app.replit.app` | Extra CORS allowed origins. Same-origin is allowed by default. |

---

## 5. Security Hardening Adaptation Matrix

| Security Control | Docker / Compose Baseline | Replit Production Adaptation | Status |
|---|---|---|---|
| **Non-root Container** | `USER nonroot` in Dockerfile | Nix isolated user space inside VM sandbox. | Preserved |
| **CORS Policy** | Explicit localhost / custom domain list | Same-origin default (`http://host:8080` or `https://app.replit.app`) + `CORS_ORIGIN` support. | Preserved |
| **Security Headers** | NGINX reverse proxy headers | Injected directly by `scripts/replit-reverse-proxy.mjs` (`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `HSTS`). | Preserved |
| **Rate Limiting** | In-memory token bucket + Redis store | Ingress sliding window limiter in reverse proxy + API-level rate limiting in Hono. | Preserved |
| **Token Revocation** | Redis blacklisting | `ioredis` connecting over TLS (`rediss://`) to Upstash Redis. | Preserved |
| **TLS / SSL** | Traefik / Let's Encrypt container | Automatic termination at Replit edge router. | Preserved |

---

## 6. Deployment Runbook

### 6.1 First-Time Setup
1. **Clone / Import Repository** into Replit from GitHub.
2. Replit automatically detects `.replit` and `replit.nix`.
3. Open **Secrets** and configure all required variables (`JWT_SECRET`, `ADMIN_TOKEN`, `REDIS_URL`).
4. Click **Deploy** in the top right of the Replit workspace.
5. Select **Reserved VM** deployment tier.
6. Configure Build & Run commands (already pre-filled from `.replit`):
   - **Build**: `node scripts/replit-build.mjs`
   - **Run**: `node scripts/replit-supervisor.mjs`
7. Click **Deploy Repl**.

### 6.2 Pre-Flight Validation Command
Before pushing changes to GitHub/Replit, run the automated deployment pipeline locally:

```bash
pnpm deploy:replit
```

This automates the 5 validation gates:
1. Monorepo TypeScript compilation (`pnpm typecheck`)
2. 18-Domain Golden Determinism invariant test suite
3. Comprehensive unit, integration, and invariant test suite (`pnpm test:all`)
4. Replit configuration manifest validation (`.replit`, `replit.nix`)
5. Full production build verification (`node scripts/replit-build.mjs`)

### 6.3 Verifying Live Deployment
Once deployed, verify the deployment using the automated smoke test suite:

```bash
pnpm smoke:replit --url=https://your-deployment.replit.app
```

The suite validates:
- [x] Deployment health probe (`/deployment-health` 200 OK)
- [x] Security headers (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`)
- [x] REST API liveness (`/api/health`, `/api/metrics`)
- [x] Authentication & JWT generation (`/api/auth/dev-login`)
- [x] All 18 canonical simulation domain routes
- [x] Real-time WebSocket connection, handshake, room subscription, and simulation frame delivery
- [x] Ingress rate limiting enforcement (HTTP 429 under burst load)
- [x] Unauthorized access rejection & token verification

---

## 7. Custom Domain & DNS Runbook

1. In Replit Deployment settings, select **Settings** -> **Custom Domains**.
2. Enter your custom domain (e.g., `visualizer.yourdomain.com`).
3. Add the DNS records provided by Replit to your DNS registrar:
   - **Type**: `CNAME`
   - **Name**: `visualizer` (or `@` for apex)
   - **Target**: Provided Replit edge hostname
4. Wait for DNS propagation (typically 2–15 minutes).
5. Replit automatically provisions a Let's Encrypt TLS certificate.

---

## 8. Rollback & Troubleshooting

### Supervisor / Process Logs
- View live streaming logs in the Replit Deployment Console.
- `[API-3000]`, `[WS-3001]`, `[WEB-3002]`, and `[PROXY-8080]` prefixes identify individual process outputs.

### Rollback Process
1. In the Replit Deployment history tab, locate the last known good deployment.
2. Click **Rollback to this version**.
3. Or locally: `git revert HEAD && git push origin main`.
