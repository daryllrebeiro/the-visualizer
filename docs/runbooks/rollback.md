# Release Rollback Playbook

This runbook outlines the step-by-step procedures to revert application releases, database migrations, or configuration deployments in the event of critical production issues.

---

## 1. Trigger Criteria for Rollback
Initiate a rollback if any of the following occur post-deployment:
* **Error Rate**: API HTTP 5xx responses or WebSocket gateway disconnects exceed **1.0%** of total traffic.
* **Latency**: P95 API response times increase by **>200%** (e.g. database locking or connection leaks).
* **Data Integrity**: Safety invariants fail or unexpected database constraint violations are observed.
* **Vulnerabilities**: A security breach or active exploit is discovered in the deployed code.

---

## 2. Application Layer Rollback (Google Cloud Run)

Google Cloud Run retains previous container revisions, allowing instant, zero-downtime rollbacks by redirecting traffic back to the last stable revision.

### 2.1 Identify the Stable Revision
List recent revisions of the API and WebSocket services:
```bash
# For REST API
gcloud run revisions list --service=visualizer-api-production --region=us-central1

# For WebSocket Gateway
gcloud run revisions list --service=visualizer-ws-production --region=us-central1
```

### 2.2 Revert Traffic Routing
Direct 100% of production traffic back to the last verified stable revision (e.g., `visualizer-api-production-00042`):
```bash
# Revert REST API
gcloud run services update-traffic visualizer-api-production \
  --region=us-central1 \
  --to-revisions=visualizer-api-production-00042=100

# Revert WebSocket Gateway
gcloud run services update-traffic visualizer-ws-production \
  --region=us-central1 \
  --to-revisions=visualizer-ws-production-00042=100
```
* **Draining**: Cloud Run automatically drains active connections on the faulty revision and routes all new traffic immediately to the stable version.

---

## 3. Database Layer Rollback (PostgreSQL)

Reverting database migrations carries data-loss risk if the new schema has already written production data. Follow the appropriate scenario below.

### Scenario A: Forward-Compatible Migrations (Recommended)
If the migration was non-destructive (e.g. adding a nullable column, creating an index), **do not roll back the database schema**. Leave the new column/index in place and simply roll back the application layer. Create a subsequent cleanup migration later to drop the unused elements.

### Scenario B: Drizzle Rollback (Non-destructive Schema Rollback)
For simple schema reverts without data truncation, roll back the schema using Drizzle's migration state:
```bash
# Generate the rollback SQL from Drizzle history
# and run migrations rollback
pnpm drizzle-kit drop
```

### Scenario C: Destructive Migration Rollback (Point-in-Time Recovery)
If a destructive migration was run and corrupt data was committed, perform a Cloud SQL Point-in-Time Recovery (PITR) to clone the database to a millisecond prior to the deployment timestamp:
```bash
gcloud sql instances clone visualizer-db-production visualizer-db-restored \
  --point-in-time "2026-08-21T00:10:00.000Z"
```
Once cloned, update the `DATABASE_URL` config variable on Cloud Run to point to `visualizer-db-restored`.

---

## 4. WebSocket Gateway Rollback Controls
* **Active Connections**: Active WebSocket clients will be disconnected during the traffic switch.
* **Auto-Reconnection**: The client-side visualizer codebase uses exponential backoff reconnection. Sockets will automatically reconnect to the restored gateway version.
* **Reconciliation**: Upon connection, clients automatically send `INTENT_REQUEST_SNAPSHOT` to fetch the authoritative simulation state, reconciling any telemetry gaps instantly.

---

## 5. Cache Invalidation (Redis)
After rolling back application servers, clear any cached topology schemas that may contain incompatible structures:
```bash
# Connect to Memorystore Redis and execute flush
redis-cli -h <redis_host> -p <redis_port> FLUSHALL
```
This forces application nodes to query Postgres for the canonical topology schemas, resetting cache states safely.
