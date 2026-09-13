/**
 * System Lab kernel types — composite systems orchestrating DomainPlugins.
 * Zero I/O. Deterministic. Portable (no Node builtins).
 */
export type ComponentStatus = 'idle' | 'active' | 'success' | 'warning' | 'failure' | 'blocked' | 'degraded';

export interface ComponentRuntimeState {
  status: ComponentStatus;
  queueDepth: number;
  processed: number;
  failed: number;
  /** Domain-delegated or builtin semantic state (cache map, db rows, locks, ledger…). */
  data: Record<string, unknown>;
  load: number;
  degradedReason?: string | undefined;
}

export interface SystemInputEvent {
  tick: number;
  type: string;
  source?: string | undefined;
  target?: string | undefined;
  payload?: Record<string, unknown> | undefined;
}

export interface SystemFailureSchedule {
  target: string;
  type: 'crash' | 'latency' | 'error' | 'partition' | 'capacity';
  startTick: number;
  durationTicks?: number | undefined;
  config?: Record<string, unknown> | undefined;
}

export interface SystemScript {
  seed: number;
  events: SystemInputEvent[];
  failures?: SystemFailureSchedule[] | undefined;
  maxTicks?: number | undefined;
}

export interface SystemEmittedEvent {
  id: string;
  tick: number;
  simTimeMs: number;
  type: string;
  source: string;
  target?: string | undefined;
  payload: Record<string, unknown>;
  latencyMs?: number | undefined;
  result?: 'SUCCESS' | 'FAILURE' | 'PENDING' | undefined;
  causationId?: string | undefined;
  explain?: string | undefined;
}

export interface SystemFrame {
  tick: number;
  simTimeMs: number;
  componentStates: Record<string, ComponentRuntimeState>;
  activeEvents: SystemEmittedEvent[];
  violation: { name: string; description: string } | null;
}

export interface SystemMetrics {
  totalEvents: number;
  successful: number;
  failed: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  cacheHits: number;
  cacheMisses: number;
  hitRate: number;
  retries: number;
  timeouts: number;
  queueDepth: number;
}

export interface SystemRunResult {
  systemId: string;
  seed: number;
  frames: SystemFrame[];
  events: SystemEmittedEvent[];
  finalStates: Record<string, ComponentRuntimeState>;
  metrics: SystemMetrics;
  violation: { name: string; description: string; tick: number } | null;
  contentHash: string;
}

export interface ValidationIssue {
  severity: 'ERROR' | 'WARNING' | 'EDUCATIONAL_TRADEOFF';
  code: string;
  message: string;
  componentId?: string | undefined;
}
