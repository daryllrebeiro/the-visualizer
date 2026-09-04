# TheVisualizer — Dependency & Supply Chain Audit

**Audit Date:** 2026-09-02  
**Scope:** Monorepo package dependencies, Docker base images, and CI supply chain checks.

---

## 1. Package Dependency Inventory

### Core Frameworks & Runtime

- **Node.js:** `>= 20.0.0` (CI targets Node 24, Docker targets Node 22-alpine)
- **Package Manager:** `pnpm@11.22.0` (enforced via `packageManager` field in `package.json`)
- **Next.js:** `15.5.23` (`apps/web`)
- **Hono:** `4.13.3` (`apps/api` and `apps/ws-gateway`)
- **Turborepo:** `2.3.3`

### Security & Data Serialization

- **Zod:** `3.24.1` (Unified contract validation in `packages/contracts`)
- **msgpackr:** `1.11.2` (Binary WebSocket serialization)
- **fast-json-patch:** `3.1.1` (RFC 6902 delta patching)
- **fast-check:** `3.22.0` (Property-based fuzz testing in `packages/test-utils`)

### Observability & Logging

- **Pino:** High-performance structured logging (`packages/logging`)
- **OpenTelemetry API & SDK:** `1.9.0` / `0.57.2`

---

## 2. Docker Container Base Image Audit

### Current Configuration (`Dockerfile`):

- **Base Image:** `node:22-alpine` (unpinned tag)
- **User Security:** Dedicated non-privileged system user (`nextjs:nodejs`, UID/GID 1001)
- **Multi-Stage Build:** 4 distinct stages (`base` → `deps` → `builder` → `runner`)
- **Standalone Build:** Next.js standalone output bundle reduces final container footprint to minimal production dependencies.

### Hardening Recommendations:

1. **Digest Pinning:** Pin `node:22-alpine` to its immutable SHA256 image digest to protect against upstream image mutation.
2. **Read-Only Root Filesystem:** Configure container runtime with `readOnlyRootFilesystem: true` and mount `/tmp` as a `tmpfs` volume.
3. **Capability Dropping:** Drop all default Linux capabilities (`ALL`) and retain only required permissions.

---

## 3. Supply Chain & Secret Scanning in CI

| Tool                          | Purpose                                    | CI Job Status                                             |
| ----------------------------- | ------------------------------------------ | --------------------------------------------------------- |
| **TruffleHog**                | Automated secret scanning on every push/PR | ✅ Enforced in `.github/workflows/ci.yml` (`secret-scan`) |
| **pnpm audit**                | Dependency vulnerability scan              | ✅ Included in security validation                        |
| **Deterministic Golden Gate** | State hash consistency check               | ✅ Enforced in `test-determinism` job                     |
| **Codecov**                   | Test coverage reporting                    | ✅ Configured                                             |

---

## 4. Audit Summary & Next Steps

No high or critical CVEs detected in core packages. The system strictly isolates discrete simulation state machines from external network libraries, eliminating typical Remote Code Execution (RCE) and injection attack surfaces.
