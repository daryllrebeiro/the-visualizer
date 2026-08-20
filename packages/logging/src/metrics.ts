import client from 'prom-client';

// Create a custom Prometheus registry
export const register = new client.Registry();

// Collect default Node.js process metrics (CPU, Memory, Event Loop Lag, etc.)
client.collectDefaultMetrics({ register });

// ─── HTTP Metrics ─────────────────────────────────────────────────────────────

export const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests processed',
  labelNames: ['method', 'route', 'status'],
  registers: [register],
});

export const httpRequestDurationSeconds = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request latency in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

// ─── WebSocket Metrics ────────────────────────────────────────────────────────

export const wsActiveConnections = new client.Gauge({
  name: 'ws_active_connections',
  help: 'Total number of active WebSocket connections',
  labelNames: ['room'],
  registers: [register],
});

export const wsMessagesReceivedTotal = new client.Counter({
  name: 'ws_messages_received_total',
  help: 'Total number of WebSocket messages received from clients',
  labelNames: ['type'],
  registers: [register],
});

export const wsMessagesSentTotal = new client.Counter({
  name: 'ws_messages_sent_total',
  help: 'Total number of WebSocket messages sent to clients',
  labelNames: ['type'],
  registers: [register],
});

export const wsConnectionDropsTotal = new client.Counter({
  name: 'ws_connection_drops_total',
  help: 'Total number of WebSocket connections dropped or closed',
  labelNames: ['reason'],
  registers: [register],
});

export const wsRateLimitedMessagesTotal = new client.Counter({
  name: 'ws_rate_limited_messages_total',
  help: 'Total number of WebSocket messages rate limited',
  labelNames: ['userId', 'tier'],
  registers: [register],
});

// ─── Simulation Engine Metrics ──────────────────────────────────────────────

export const simActiveSessions = new client.Gauge({
  name: 'sim_active_sessions',
  help: 'Total number of active simulation sessions',
  registers: [register],
});

export const simTicksProcessedTotal = new client.Counter({
  name: 'sim_ticks_processed_total',
  help: 'Total number of simulation ticks executed',
  registers: [register],
});

export const simTickDurationSeconds = new client.Histogram({
  name: 'sim_tick_duration_seconds',
  help: 'Simulation tick execution duration in seconds',
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5],
  registers: [register],
});

export const simQueueSize = new client.Gauge({
  name: 'sim_queue_size',
  help: 'Current size of the simulation intents queue',
  labelNames: ['roomId'],
  registers: [register],
});

export const simInvariantViolationsTotal = new client.Counter({
  name: 'sim_invariant_violations_total',
  help: 'Total number of simulation invariant violations',
  labelNames: ['invariant'],
  registers: [register],
});

export const simResourceLimitsExceededTotal = new client.Counter({
  name: 'sim_resource_limits_exceeded_total',
  help: 'Total number of resource limit exceedances',
  labelNames: ['reason'],
  registers: [register],
});
