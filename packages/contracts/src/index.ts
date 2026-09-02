/**
 * packages/contracts — Authoritative Domain Model & Wire Protocol Contracts
 *
 * This is the single source of truth for:
 *   - TypeScript types (compile-time safety)
 *   - Zod schemas (runtime validation safety)
 *   - WebSocket wire protocol
 *   - REST API contracts
 *   - Topology import/export format
 *
 * Every other package and app imports from here.
 * Never define domain types in application code.
 */

// Domain
export * from './domain/index.js';

// WebSocket protocol
export * from './websocket/index.js';

// API contracts
export * from './api/index.js';

// Auth & Revocation
export * from './auth/token-revocation.js';
