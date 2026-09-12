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
export * from './websocket/gateway-messages.js';

// API contracts
export * from './api/index.js';

// Auth & Revocation
export * from './auth/token-revocation.js';
export * from './auth/ws-ticket-store.js';

// Learning & platform features (progress, timelines, quizzes, badges, challenges)
export * from './learn/index.js';

// Executable scenario scripts (Scenario Studio)
export * from './scenario/index.js';

// Multi-player classroom sessions
export * from './classroom/index.js';

// Topology definition bounds (DoS hardening)
export * from './topology/definition.js';

// Composite systems (System Lab): definitions, events, failures, challenges
export * from './systems/index.js';

