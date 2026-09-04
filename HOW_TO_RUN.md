# How to Run & Install

This guide details configuring, provisioning dependencies, compiling, and running **The Visualizer** platform locally and via Docker.

---

## 1. Prerequisites

- **Node.js**: `v20.x` or newer (Recommended: `v22.x`)
- **pnpm**: `v9.x` or `v10.x` / `v11.x`
- **Docker & Docker Compose**: For containerized deployment and database services.

---

## 2. Quick Start: Full Stack with Docker Compose

The fastest way to run the entire platform (PostgreSQL 16, Redis 7, REST API, WebSocket Gateway, and Next.js Web UI) is with Docker Compose:

```bash
# Clone the repository
git clone https://github.com/daryllrebeiro/the-visualizer.git
cd the-visualizer

# Launch all 5 containers
docker compose up --build -d
```

### Service Endpoints

- **Web UI (Next.js)**: `http://localhost:3002`
- **REST API (Hono)**: `http://localhost:3000` (Health: `http://localhost:3000/health`)
- **WebSocket Gateway**: `ws://localhost:3001` (Health: `http://localhost:3001/health`)
- **Redis**: `localhost:6379` (password: `redis_local_secret`)
- **PostgreSQL**: `localhost:5432` (db: `visualizer_db`, user: `visualizer_user`)

---

## 3. Local Development Setup

To run each application locally with hot-reloading:

### 3.1 Install Dependencies

```bash
pnpm install
```

### 3.2 Configure Environment

```bash
cp .env.example .env
```

Default local variables:

```env
PORT=3000
DATABASE_URL=postgresql://visualizer_user:visualizer_password@localhost:5432/visualizer_db
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=redis_local_secret
SESSION_SECRET=super-secret-key-that-is-at-least-32-chars-long
ALLOWED_ORIGINS=http://localhost:3002,http://127.0.0.1:3002
```

### 3.3 Start Background Databases

```bash
docker compose up redis postgres -d
```

### 3.4 Apply Database Migrations (Optional)

```bash
pnpm --filter @the-visualizer/api db:migrate
```

### 3.5 Start Dev Servers

```bash
pnpm dev
```

---

## 4. Building for Production

Compile optimized TypeScript bundles and Next.js static assets across all 10 monorepo packages:

```bash
pnpm build
```

---

## 5. Running Test Suites

Execute unit, integration, and E2E simulation suites:

```bash
# Run tests across all workspace packages
pnpm test

# Run Simulation Engine test suite (44 tests including full lifecycle E2E)
pnpm --filter @the-visualizer/simulation test

# Run WebSocket Gateway test suite (16 tests including Redis queue draining)
$env:REDIS_URL="redis://localhost:6379"; $env:REDIS_PASSWORD="redis_local_secret"; $env:SESSION_SECRET="super-secret-key-that-is-at-least-32-chars-long"; pnpm --filter @the-visualizer/ws-gateway test
```
