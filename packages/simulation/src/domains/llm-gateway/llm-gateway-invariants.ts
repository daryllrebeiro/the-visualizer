import type { LlmGatewayClusterState } from './llm-gateway-types.js';

export class LlmGatewayInvariantChecker {
  public check(
    state: LlmGatewayClusterState,
  ): { invariantName: string; description: string } | undefined {
    // GW-1: Circuit Breaker State Machine Rigor & Fallback Routing
    // 1. Audit transition log for illegal FSM transitions
    const validTransitions: Record<string, string[]> = {
      CLOSED: ['OPEN'],
      OPEN: ['HALF_OPEN'],
      HALF_OPEN: ['CLOSED', 'OPEN'],
    };

    for (const tr of state.transitionLog) {
      const allowedNext = validTransitions[tr.from];
      if (!allowedNext || !allowedNext.includes(tr.to)) {
        return {
          invariantName: 'GW-1',
          description: `Illegal Circuit Breaker transition for provider '${tr.providerId}': '${tr.from}' -> '${tr.to}'. Allowed: ${allowedNext?.join(', ') || 'none'}.`,
        };
      }
    }

    // 2. Validate current provider states against internal counters
    for (const [providerId, provider] of Object.entries(state.providers)) {
      const cb = provider.circuitBreaker;

      // In HALF_OPEN, cooldown ticks must be 0
      if (cb.state === 'HALF_OPEN' && cb.cooldownTicksRemaining > 0) {
        return {
          invariantName: 'GW-1',
          description: `Circuit Breaker state violation: provider '${providerId}' is HALF_OPEN while cooldown ticks remain (${cb.cooldownTicksRemaining} > 0).`,
        };
      }

      // If consecutiveFailures >= failureThreshold and provider is still CLOSED (and not reset), it must trip to OPEN
      if (cb.state === 'CLOSED' && cb.consecutiveFailures >= cb.failureThreshold) {
        return {
          invariantName: 'GW-1',
          description: `Circuit Breaker trip violation: provider '${providerId}' has ${cb.consecutiveFailures} consecutive failures (>= threshold ${cb.failureThreshold}) but remains CLOSED.`,
        };
      }
    }

    // 3. Fallback routing verification: when fallbackProviderId is chosen, primary must have been OPEN
    for (const req of state.recentRequests) {
      if (req.status === 'FALLBACK_ROUTED') {
        if (!req.selectedProviderId || !req.fallbackProviderId) {
          return {
            invariantName: 'GW-1',
            description: `Fallback routing violation: request '${req.id}' is FALLBACK_ROUTED but missing provider references.`,
          };
        }
        if (req.primaryStateAtDispatch === 'CLOSED') {
          return {
            invariantName: 'GW-1',
            description: `Fallback routing violation: request '${req.id}' fell back to '${req.fallbackProviderId}' while primary provider '${req.selectedProviderId}' was healthy and CLOSED.`,
          };
        }
      }
    }

    // GW-2: Pre-Execution Guardrail Injection Rejection
    if (state.guardrails.injectionFilterEnabled) {
      for (const req of state.recentRequests) {
        const containsAttack = state.guardrails.blockedKeywords.some((kw) =>
          req.prompt.toLowerCase().includes(kw.toLowerCase()),
        );
        if (containsAttack && req.status !== 'BLOCKED') {
          return {
            invariantName: 'GW-2',
            description: `Guardrail bypass violation: prompt containing injection pattern was not BLOCKED (status is '${req.status}').`,
          };
        }
        if (req.status === 'BLOCKED' && (req.costUsd > 0 || req.selectedProviderId !== null)) {
          return {
            invariantName: 'GW-2',
            description: `Guardrail billing violation: BLOCKED request incurred cost or dispatched to upstream provider '${req.selectedProviderId}'.`,
          };
        }
      }
    }

    // GW-3: Semantic Cache Similarity Bound
    for (const req of state.recentRequests) {
      if (req.status === 'CACHE_HIT') {
        if (req.cacheSimilarity < state.cacheConfig.similarityThreshold) {
          return {
            invariantName: 'GW-3',
            description: `Semantic cache boundary violation: request '${req.id}' returned CACHE_HIT with cosine similarity ${req.cacheSimilarity.toFixed(3)} < threshold ${state.cacheConfig.similarityThreshold.toFixed(3)}.`,
          };
        }
        if (req.costUsd > 0) {
          return {
            invariantName: 'GW-3',
            description: `Semantic cache cost violation: CACHE_HIT request '${req.id}' incurred upstream cost $${req.costUsd}.`,
          };
        }
      }
    }

    // GW-4: Rate / Cost Ceiling
    if (state.rateLimitConfig.currentTickRequests > state.rateLimitConfig.maxRequestsPerTick) {
      return {
        invariantName: 'GW-4',
        description: `Rate limit violation: ${state.rateLimitConfig.currentTickRequests} requests in tick ${state.tick} exceeded ceiling of ${state.rateLimitConfig.maxRequestsPerTick}.`,
      };
    }

    if (state.rateLimitConfig.usedBudgetUsd > state.rateLimitConfig.budgetUsd) {
      return {
        invariantName: 'GW-4',
        description: `Budget ceiling violation: used budget $${state.rateLimitConfig.usedBudgetUsd.toFixed(2)} exceeded limit of $${state.rateLimitConfig.budgetUsd.toFixed(2)}.`,
      };
    }

    return undefined;
  }
}
