/**
 * Model Deployment & Canary Rollout — simulation types.
 *
 * Progressive delivery: model registry with staging, shadow-traffic
 * mirroring, percentage-based canary, automatic metric-based rollback
 * (a canary-health FSM with the same semantics as /llm-gateway's GW-1
 * circuit breaker — Q.5 swaps in the real state machine), and
 * statistical-significance-gated promotion.
 *
 * The `evalGate` field is the contract-first seam for the /llm-eval
 * (Domain 25) cross-domain invariant EVAL-4: the standalone domain
 * drives it with constructed gates; Q.5 wires real eval run outputs.
 *
 * References:
 * - Argo Rollouts / Flagger docs — canary steps, analysis, rollback
 * - Kohavi, Tang, Xu (2020): Trustworthy Online Controlled Experiments
 * - MLflow Model Registry docs — stage transitions, versioning
 */

export type ModelStage = 'NONE' | 'SHADOW' | 'CANARY' | 'STABLE' | 'ARCHIVED';

export interface VersionMetrics {
  requests: number;
  errors: number;
  /** business-metric conversions (e.g. purchases, accepted answers) */
  conversions: number;
  latencyTickSum: number;
}

export interface RolloutRollbackState {
  /** canary-health FSM: HEALTHY -> OPEN (threshold breached for the
   * window) -> ROLLED_BACK. Q.5 reuses the GW-1 breaker machine. */
  fsm: 'HEALTHY' | 'OPEN' | 'ROLLED_BACK';
  triggeredAtTick: number | null;
  triggerMetric: string | null;
}

export interface EvalGateInput {
  sourceRunId: string;
  policyVersion: number;
  criticalPassed: boolean;
  blocked: boolean;
}

export interface PromotionAttempt {
  tick: number;
  allowed: boolean;
  reasons: string[];
  /** snapshot of the decision inputs */
  sampleSizes: { baseline: number; canary: number };
  zScore: number | null;
}

export interface ModelRolloutClusterState {
  clusterId: string;
  tick: number;
  rngState?: number;
  registry: Record<string, { id: string; stage: ModelStage }>;
  modelOrder: string[];
  baselineVersion: string;
  canaryVersion: string | null;
  shadowVersion: string | null;
  shadowEnabled: boolean;
  trafficSplit: { baselinePercent: number; canaryPercent: number };
  /** per-version traffic outcome rates (scripted, deterministic per seed) */
  modelRates: Record<string, { errorRate: number; conversionRate: number }>;
  metrics: Record<string, VersionMetrics>;
  /** shadow lane metrics — strictly separate from live metrics (ROLL-1) */
  shadowMetrics: VersionMetrics;
  rolloutPolicy: {
    errorRateThreshold: number;
    evaluationWindowTicks: number;
    significanceAlpha: number;
    minSamplePerArm: number;
  };
  /** consecutive bad ticks in the current evaluation window */
  consecutiveBadTicks: number;
  windowStartTick: number;
  rollback: RolloutRollbackState;
  /** contract-first seam (Q.5: /llm-eval gate output) */
  evalGate: EvalGateInput | null;
  lastPromotionAttempt: PromotionAttempt | null;
  lastRollbackEvent: { tick: number; version: string; triggerMetric: string } | null;
  stats: {
    totalRequests: number;
    shadowRequests: number;
    /** window-scoped dispatch counters (ROLL-1/ROLL-2 checks) */
    windowDispatched: number;
    windowShadow: number;
    promotionsAttempted: number;
    promotionsBlocked: number;
    rollbacks: number;
  };
}

export type ModelRolloutSimEvent =
  | { id: string; tick: number; type: 'ROLL_TICK'; payload: Record<string, unknown> }
  | { id: string; tick: number; type: 'ROLL_REGISTER_MODEL'; payload: { id: string; errorRate?: number; conversionRate?: number } }
  | { id: string; tick: number; type: 'ROLL_SET_CANARY'; payload: { version: string; percent: number } }
  | { id: string; tick: number; type: 'ROLL_SET_SHADOW'; payload: { version: string; enabled: boolean } }
  | { id: string; tick: number; type: 'ROLL_SEND_TRAFFIC'; payload: { count: number } }
  | { id: string; tick: number; type: 'ROLL_SET_RATES'; payload: { version: string; errorRate?: number; conversionRate?: number } }
  | { id: string; tick: number; type: 'ROLL_PROMOTE'; payload: Record<string, unknown> }
  | { id: string; tick: number; type: 'ROLL_SET_EVAL_GATE'; payload: { gate: EvalGateInput } }
  | { id: string; tick: number; type: 'ROLL_CLEAR_EVAL_GATE'; payload: Record<string, unknown> };

/** Resource caps (hard-clamped; surfaced in UI when hit). */
export const ROLL_CAPS = {
  maxLiveVersions: 6,
  maxTrafficBatch: 10_000,
  metricsCap: 1_000_000,
} as const;
