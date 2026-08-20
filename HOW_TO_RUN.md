# How to Run & Install

This guide provides instructions for configuring, installing dependencies, provisioning databases, compiling, and executing the Visualizer platform locally.

---

## 1. Prerequisites
Ensure the following tools are installed on your host machine:
* **Node.js**: `v20.x` or newer (Recommended: `v20.18.0` / `v22.x`)
* **pnpm**: `v11.x` (Monorepo dependency manager)
* **Docker & Docker Compose**: For local PostgreSQL and Redis instances.

---

## 2. Installation
Clone the repository and install workspace dependencies:
```bash
# Clone the repository
git clone https://github.com/daryllrebeiro/the-visualizer.git
cd the-visualizer

# Install dependencies using lockfile
pnpm install --frozen-lockfile
```

---

## 3. Environment Configuration
Copy the sample environment configuration file and adjust variables if needed:
```bash
cp .env.example .env
```
Key variables configured in `.env`:
* `DATABASE_URL`: Connection string for Postgres (default: `postgresql://visualizer:visualizer_local@localhost:5432/visualizer_dev`)
* `REDIS_URL`: Connection string for Redis (default: `redis://localhost:6379`)
* `JWT_SECRET` & `SESSION_SECRET`: Authn keys (minimum 32-character keys)

---

## 4. Spin Up Databases (Docker)
Start PostgreSQL and Redis containers:
```bash
# Start Docker services in the background
docker compose -f infrastructure/docker/docker-compose.yml up -d
```
Verify the databases are healthy and listening on ports `5432` (Postgres) and `6379` (Redis).

---

## 5. Database Migrations
Create schema tables and apply Drizzle migrations:
```bash
# Run migrations on the local database
pnpm --filter @the-visualizer/api db:migrate
```

---

## 6. Running Development Servers
Launch all applications (REST API, WebSocket Gateway, Next.js web client) concurrently:
```bash
# Starts development servers in parallel
pnpm dev
```
The services will listen on the following ports:
* **Next.js Web Client**: `http://localhost:3002` (or next free port)
* **Hono REST API**: `http://localhost:3000`
* **WebSocket Gateway**: `ws://localhost:3001`

---

## 7. Compiling the Production Build
To verify type safety and compile optimized production bundles:
```bash
# Builds all packages and apps
pnpm build
```

---

## 8. Running Tests

### 8.1 Unit & Integration Tests
Execute the Vitest test suites (contracts, simulation, API rates, RLS, ssrf, and gateways):
```bash
# Run all tests once
npx vitest run
```

### 8.2 Load Testing (k6)
Ensure local servers are running, then run k6 load tests:
```bash
# If k6 is installed locally:
k6 run infrastructure/load-test/api.js
k6 run infrastructure/load-test/websocket.js

# Or run using Docker:
docker run --rm -i -v $(pwd)/infrastructure:/infrastructure grafana/k6 run /infrastructure/load-test/api.js
```
