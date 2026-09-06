/**
 * LLM Gateway & Guardrails Simulation Types & State Model
 * High-fidelity modeling of Multi-Provider Routing, Circuit Breaker State Machine,
 * Cosine Semantic Caching, and Pre-Execution Guardrail Invariants.
 */

export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface ProviderCircuitBreaker {
  state: CircuitBreakerState;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  failureThreshold: number;       // default 3
  successThreshold: number;       // default 2 (for HALF_OPEN -> CLOSED)
  cooldownTicks: number;          // default 5
  cooldownTicksRemaining: number;
  lastStateChangeTick: number;
  totalRequests: number;
  totalFailures: number;
}

export interface UpstreamProvider {
  id: string;
  name: string;
  model: string;
  priority: number;               // 1 = primary, 2 = secondary, 3 = tertiary
  latencyMs: number;
  costPer1kTokens: number;
  isOutageSimulated: boolean;     // Chaos injection flag
  circuitBreaker: ProviderCircuitBreaker;
}

export interface SemanticCacheEntry {
  id: string;
  promptPattern: string;
  embedding: [number, number];    // 2D unit vector [cos(rad), sin(rad)]
  angleDeg: number;               // Polar angle [0, 360)
  response: string;
  hitCount: number;
  createdTick: number;
}

export interface SemanticCacheConfig {
  similarityThreshold: number;    // default 0.88
  totalHits: number;
  totalMisses: number;
  savedCostUsd: number;
  savedLatencyMs: number;
}

export interface GuardrailConfig {
  injectionFilterEnabled: boolean;
  piiMaskingEnabled: boolean;
  blockedKeywords: string[];
  totalInjectionsBlocked: number;
  totalPiiMasked: number;
}

export type GatewayRequestStatus =
  | 'PENDING'
  | 'CACHE_HIT'
  | 'ROUTED'
  | 'FALLBACK_ROUTED'
  | 'BLOCKED'
  | 'RATE_LIMITED'
  | 'FAILED';

export interface GatewayRequest {
  id: string;
  prompt: string;
  queryEmbedding: [number, number];
  queryAngleDeg: number;
  status: GatewayRequestStatus;
  selectedProviderId: string | null;
  fallbackProviderId: string | null;
  cacheSimilarity: number;
  matchedCacheId: string | null;
  latencyMs: number;
  costUsd: number;
  blockedReason?: string | undefined;
  primaryStateAtDispatch?: CircuitBreakerState | undefined;
  tick: number;
}

export interface CircuitBreakerTransition {
  providerId: string;
  from: CircuitBreakerState;
  to: CircuitBreakerState;
  reason: string;
  tick: number;
}

export interface LlmGatewayClusterState {
  clusterId: string;
  tick: number;
  providers: Record<string, UpstreamProvider>;
  cacheEntries: Record<string, SemanticCacheEntry>;
  cacheConfig: SemanticCacheConfig;
  guardrails: GuardrailConfig;
  recentRequests: GatewayRequest[];
  transitionLog: CircuitBreakerTransition[];
  rateLimitConfig: {
    maxRequestsPerTick: number;
    currentTickRequests: number;
    budgetUsd: number;
    usedBudgetUsd: number;
  };
}

export type LlmGatewaySimEvent =
  | { id: string; tick: number; type: 'GW_DISPATCH_REQUEST'; payload: { prompt: string; angleDeg?: number | undefined; forceInjection?: boolean | undefined } }
  | { id: string; tick: number; type: 'GW_SET_PROVIDER_OUTAGE'; payload: { providerId: string; outage: boolean } }
  | { id: string; tick: number; type: 'GW_TRIGGER_FAILURES'; payload: { providerId: string; count: number } }
  | { id: string; tick: number; type: 'GW_RESET_CIRCUIT_BREAKER'; payload: { providerId: string } }
  | { id: string; tick: number; type: 'GW_ADD_CACHE_ENTRY'; payload: { promptPattern: string; angleDeg: number; response: string } }
  | { id: string; tick: number; type: 'GW_UPDATE_CACHE_THRESHOLD'; payload: { threshold: number } }
  | { id: string; tick: number; type: 'GW_TOGGLE_GUARDRAIL'; payload: { guardrail: 'injection' | 'pii'; enabled: boolean } }
  | { id: string; tick: number; type: 'GW_TICK'; payload?: Record<string, unknown> }
  | { id: string; tick: number; type: 'TICK'; payload?: Record<string, unknown> };
