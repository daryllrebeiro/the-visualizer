/**
 * Load Balancer Simulation Types & State Model
 *
 * Layer 4 (connection-level) vs Layer 7 (application-aware) routing,
 * modeled after HAProxy/nginx/ALB conventions.
 *
 * References:
 * - HAProxy configuration manual — `balance` directive algorithms
 *   (roundrobin, leastconn, source/consistent-hash, weight)
 * - nginx ngx_http_upstream_module (smooth weighted round-robin,
 *   max_fails/fail_timeout passive health checks, drain state)
 * - Karger et al. (1997): Consistent Hashing and Random Trees (STOC '97)
 *   — sticky-session ring
 * - AWS ALB docs — L7 target groups, health checks, deregistration delay
 */

import type { DeterministicRNG } from '../../prng/deterministic-rng.js';

export type LBRoutingPolicy =
  | 'ROUND_ROBIN'
  | 'WEIGHTED_RR'
  | 'LEAST_CONNECTIONS'
  | 'LEAST_RESPONSE_TIME'
  | 'CONSISTENT_HASH';

export type LBBackendHealth = 'HEALTHY' | 'UNHEALTHY' | 'DRAINING';

export interface LBBackend {
  id: string;
  weight: number;
  health: LBBackendHealth;
  /** chaos flag: true once killed; health checker turns it into UNHEALTHY */
  crashed: boolean;
  inFlight: number;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  /** exponentially weighted moving average of response duration (ticks) */
  responseTimeEwma: number;
  dispatchCount: number;
  /** tick when drain started (null if not draining) */
  drainStartTick: number | null;
}

export interface LBConnection {
  id: string;
  backendId: string;
  sessionKey: string;
  startTick: number;
  durationTicks: number;
}

export interface LBRoutingDecision {
  requestId: string;
  sessionKey: string;
  backendId: string | null;
  policy: LBRoutingPolicy;
  reasoning: string;
  tick: number;
  /** health of the selected backend AT DISPATCH TIME — false means the
   * reducer routed to an ineligible backend (LB-1 checker core) */
  healthyAtDispatch: boolean;
}

export interface LBRollingDeployState {
  active: boolean;
  /** index into backendOrder of the backend currently draining */
  currentIndex: number;
  replacedCount: number;
}

export interface LBClusterState {
  clusterId: string;
  tick: number;
  rngState?: number;
  backends: Record<string, LBBackend>;
  /** stable insertion order */
  backendOrder: string[];
  routingPolicy: LBRoutingPolicy;
  /** round-robin dispatch counter (strict order over eligible backends) */
  rrCounter: number;
  /** smooth WRR current weights per backend (nginx algorithm) */
  smoothCurrentWeights: Record<string, number>;
  healthChecker: {
    interval: number;
    failureThreshold: number;
    successThreshold: number;
    lastCheckTick: number;
  };
  /** open (in-flight) connections */
  connections: Record<string, LBConnection>;
  /** completed connection log (capped) */
  connectionLog: Array<{
    id: string;
    backendId: string;
    sessionKey: string;
    startTick: number;
    endTick: number;
    durationTicks: number;
  }>;
  drainTimeoutTicks: number;
  rollingDeploy: LBRollingDeployState;
  /**
   * Consistent-hash ring over eligible (HEALTHY) backends — 64 virtual
   * nodes per backend. Rebuilt on membership or health transitions so
   * LB-3 holds: keys on healthy backends never move, keys on failed
   * backends reassign (the CHASH-1 minimal-disruption property).
   */
  ring: Array<{ position: number; backendId: string }>;
  /** sticky session table: sessionKey -> backendId */
  stickyAssignments: Record<string, string>;
  routingLog: LBRoutingDecision[];
  stats: {
    totalDispatched: number;
    totalDropped: number;
    totalCompleted: number;
    drainCompletions: number;
    drainForceCloses: number;
    failovers: number;
  };
}

export type LBSimEvent =
  | { id: string; tick: number; type: 'LB_TICK'; payload: Record<string, unknown> }
  | { id: string; tick: number; type: 'LB_REQUEST'; payload: { sessionKey?: string } }
  | {
      id: string;
      tick: number;
      type: 'LB_LOAD_TEST';
      payload: { count: number; sessionPrefix?: string };
    }
  | { id: string; tick: number; type: 'LB_SET_POLICY'; payload: { policy: LBRoutingPolicy } }
  | { id: string; tick: number; type: 'LB_SET_WEIGHT'; payload: { backendId: string; weight: number } }
  | { id: string; tick: number; type: 'LB_KILL_BACKEND'; payload: { backendId: string } }
  | { id: string; tick: number; type: 'LB_REVIVE_BACKEND'; payload: { backendId: string } }
  | { id: string; tick: number; type: 'LB_START_DRAIN'; payload: { backendId: string } }
  | { id: string; tick: number; type: 'LB_ROLLING_DEPLOY'; payload: Record<string, unknown> };

/** Resource caps (hard-clamped; surfaced in UI when hit). */
export const LB_CAPS = {
  maxBackends: 8,
  maxOpenConnections: 500,
  maxConnectionLog: 200,
  maxRoutingLog: 200,
  maxLoadTestRequests: 10_000,
  maxWeight: 100,
  vnodesPerBackend: 64,
} as const;

export interface LBRngDeps {
  rng: DeterministicRNG;
}
