import type { DeterministicRNG } from '../../prng/deterministic-rng.js';
import type {
  LlmGatewayClusterState,
  LlmGatewaySimEvent,
  UpstreamProvider,
  SemanticCacheEntry,
  GatewayRequest,
} from './llm-gateway-types.js';

export function createDefaultLlmGatewayCluster(clusterId = 'llm-gateway-prod'): LlmGatewayClusterState {
  const toUnitVector = (deg: number): [number, number] => {
    const rad = (deg * Math.PI) / 180;
    return [Math.cos(rad), Math.sin(rad)];
  };

  const providers: Record<string, UpstreamProvider> = {
    'openai-gpt4o': {
      id: 'openai-gpt4o',
      name: 'OpenAI GPT-4o',
      model: 'gpt-4o-2024-08-06',
      priority: 1,
      latencyMs: 340,
      costPer1kTokens: 0.005,
      isOutageSimulated: false,
      circuitBreaker: {
        state: 'CLOSED',
        consecutiveFailures: 0,
        consecutiveSuccesses: 0,
        failureThreshold: 3,
        successThreshold: 2,
        cooldownTicks: 5,
        cooldownTicksRemaining: 0,
        lastStateChangeTick: 0,
        totalRequests: 0,
        totalFailures: 0,
      },
    },
    'anthropic-claude35': {
      id: 'anthropic-claude35',
      name: 'Anthropic Claude 3.5 Sonnet',
      model: 'claude-3-5-sonnet-20241022',
      priority: 2,
      latencyMs: 420,
      costPer1kTokens: 0.003,
      isOutageSimulated: false,
      circuitBreaker: {
        state: 'CLOSED',
        consecutiveFailures: 0,
        consecutiveSuccesses: 0,
        failureThreshold: 3,
        successThreshold: 2,
        cooldownTicks: 5,
        cooldownTicksRemaining: 0,
        lastStateChangeTick: 0,
        totalRequests: 0,
        totalFailures: 0,
      },
    },
    'gemini-15pro': {
      id: 'gemini-15pro',
      name: 'Google Gemini 1.5 Pro',
      model: 'gemini-1.5-pro-002',
      priority: 3,
      latencyMs: 290,
      costPer1kTokens: 0.00125,
      isOutageSimulated: false,
      circuitBreaker: {
        state: 'CLOSED',
        consecutiveFailures: 0,
        consecutiveSuccesses: 0,
        failureThreshold: 3,
        successThreshold: 2,
        cooldownTicks: 5,
        cooldownTicksRemaining: 0,
        lastStateChangeTick: 0,
        totalRequests: 0,
        totalFailures: 0,
      },
    },
    'local-vllm': {
      id: 'local-vllm',
      name: 'Local vLLM Cluster',
      model: 'meta-llama/Meta-Llama-3.1-70B-Instruct',
      priority: 4,
      latencyMs: 180,
      costPer1kTokens: 0.0001,
      isOutageSimulated: false,
      circuitBreaker: {
        state: 'CLOSED',
        consecutiveFailures: 0,
        consecutiveSuccesses: 0,
        failureThreshold: 3,
        successThreshold: 2,
        cooldownTicks: 5,
        cooldownTicksRemaining: 0,
        lastStateChangeTick: 0,
        totalRequests: 0,
        totalFailures: 0,
      },
    },
  };

  const cacheEntries: Record<string, SemanticCacheEntry> = {
    'cache-sql-retention': {
      id: 'cache-sql-retention',
      promptPattern: 'Write SQL query for 30-day cohort retention',
      angleDeg: 45,
      embedding: toUnitVector(45),
      response: 'SELECT cohort_date, count(distinct user_id) FROM cohorts GROUP BY 1;',
      hitCount: 42,
      createdTick: 0,
    },
    'cache-oauth-pkce': {
      id: 'cache-oauth-pkce',
      promptPattern: 'Explain OAuth 2.0 PKCE flow for single page apps',
      angleDeg: 135,
      embedding: toUnitVector(135),
      response: 'PKCE generates a code_verifier and code_challenge to prevent authorization code interception.',
      hitCount: 19,
      createdTick: 0,
    },
    'cache-k8s-backoff': {
      id: 'cache-k8s-backoff',
      promptPattern: 'How to debug CrashLoopBackOff in Kubernetes',
      angleDeg: 225,
      embedding: toUnitVector(225),
      response: 'Check kubectl logs --previous <pod> and verify liveness probe timeouts.',
      hitCount: 31,
      createdTick: 0,
    },
  };

  return {
    clusterId,
    tick: 0,
    providers,
    cacheEntries,
    cacheConfig: {
      similarityThreshold: 0.88,
      totalHits: 92,
      totalMisses: 24,
      savedCostUsd: 0.46,
      savedLatencyMs: 27600,
    },
    guardrails: {
      injectionFilterEnabled: true,
      piiMaskingEnabled: true,
      blockedKeywords: [
        'ignore previous instructions',
        'system prompt override',
        'bypass guardrails',
        'dan mode',
        'exfiltrate secret',
        'jailbreak',
      ],
      totalInjectionsBlocked: 0,
      totalPiiMasked: 0,
    },
    recentRequests: [],
    transitionLog: [],
    rateLimitConfig: {
      maxRequestsPerTick: 50,
      currentTickRequests: 0,
      budgetUsd: 100.0,
      usedBudgetUsd: 12.45,
    },
  };
}

export function pureLlmGatewayTransition(
  state: LlmGatewayClusterState,
  event: LlmGatewaySimEvent,
  rng: DeterministicRNG,
): { nextState: LlmGatewayClusterState; emittedEvents: LlmGatewaySimEvent[] } {
  const nextState: LlmGatewayClusterState = JSON.parse(JSON.stringify(state)) as LlmGatewayClusterState;
  nextState.tick = event.tick;

  switch (event.type) {
    case 'TICK':
    case 'GW_TICK': {
      nextState.rateLimitConfig.currentTickRequests = 0;

      // Consume RNG to ensure deterministic timeline jitter across seeds
      const jitter = rng.nextFloat();

      for (const provider of Object.values(nextState.providers)) {
        const cb = provider.circuitBreaker;
        // Jitter provider latency slightly
        provider.latencyMs = Math.round(provider.latencyMs * (0.98 + jitter * 0.04));

        if (cb.state === 'OPEN') {
          if (cb.cooldownTicksRemaining > 0) {
            cb.cooldownTicksRemaining -= 1;
          }
          if (cb.cooldownTicksRemaining === 0) {
            // GW-1: OPEN -> HALF_OPEN
            cb.state = 'HALF_OPEN';
            cb.consecutiveSuccesses = 0;
            cb.lastStateChangeTick = event.tick;
            nextState.transitionLog.push({
              providerId: provider.id,
              from: 'OPEN',
              to: 'HALF_OPEN',
              reason: 'Cooldown expired; entering probing phase',
              tick: event.tick,
            });
          }
        }
      }
      break;
    }

    case 'GW_SET_PROVIDER_OUTAGE': {
      const provider = nextState.providers[event.payload.providerId];
      if (provider) {
        provider.isOutageSimulated = event.payload.outage;
      }
      break;
    }

    case 'GW_TRIGGER_FAILURES': {
      const provider = nextState.providers[event.payload.providerId];
      if (provider) {
        const cb = provider.circuitBreaker;
        cb.consecutiveFailures += event.payload.count;
        cb.totalFailures += event.payload.count;

        if (cb.state === 'HALF_OPEN') {
          // Half-open failure immediately trips back to OPEN
          cb.state = 'OPEN';
          cb.cooldownTicksRemaining = cb.cooldownTicks;
          cb.consecutiveFailures = 0;
          cb.consecutiveSuccesses = 0;
          cb.lastStateChangeTick = event.tick;
          nextState.transitionLog.push({
            providerId: provider.id,
            from: 'HALF_OPEN',
            to: 'OPEN',
            reason: 'Failure observed during HALF_OPEN probe',
            tick: event.tick,
          });
        } else if (cb.state === 'CLOSED' && cb.consecutiveFailures >= cb.failureThreshold) {
          // CLOSED -> OPEN
          cb.state = 'OPEN';
          cb.cooldownTicksRemaining = cb.cooldownTicks;
          cb.lastStateChangeTick = event.tick;
          nextState.transitionLog.push({
            providerId: provider.id,
            from: 'CLOSED',
            to: 'OPEN',
            reason: `Exceeded failure threshold (${cb.consecutiveFailures} >= ${cb.failureThreshold})`,
            tick: event.tick,
          });
        }
      }
      break;
    }

    case 'GW_RESET_CIRCUIT_BREAKER': {
      const provider = nextState.providers[event.payload.providerId];
      if (provider) {
        const cb = provider.circuitBreaker;
        if (cb.state !== 'CLOSED') {
          nextState.transitionLog.push({
            providerId: provider.id,
            from: cb.state,
            to: 'CLOSED',
            reason: 'Operator manual reset',
            tick: event.tick,
          });
          cb.state = 'CLOSED';
        }
        cb.consecutiveFailures = 0;
        cb.consecutiveSuccesses = 0;
        cb.cooldownTicksRemaining = 0;
        cb.lastStateChangeTick = event.tick;
        provider.isOutageSimulated = false;
      }
      break;
    }

    case 'GW_UPDATE_CACHE_THRESHOLD': {
      nextState.cacheConfig.similarityThreshold = event.payload.threshold;
      break;
    }

    case 'GW_TOGGLE_GUARDRAIL': {
      if (event.payload.guardrail === 'injection') {
        nextState.guardrails.injectionFilterEnabled = event.payload.enabled;
      } else if (event.payload.guardrail === 'pii') {
        nextState.guardrails.piiMaskingEnabled = event.payload.enabled;
      }
      break;
    }

    case 'GW_ADD_CACHE_ENTRY': {
      const rad = (event.payload.angleDeg * Math.PI) / 180;
      const entryId = `cache-${Object.keys(nextState.cacheEntries).length + 1}`;
      nextState.cacheEntries[entryId] = {
        id: entryId,
        promptPattern: event.payload.promptPattern,
        angleDeg: event.payload.angleDeg,
        embedding: [Math.cos(rad), Math.sin(rad)],
        response: event.payload.response,
        hitCount: 0,
        createdTick: event.tick,
      };
      break;
    }

    case 'GW_DISPATCH_REQUEST': {
      const { prompt, angleDeg: reqAngle, forceInjection } = event.payload;

      // Rate limit / budget check
      if (
        nextState.rateLimitConfig.currentTickRequests >= nextState.rateLimitConfig.maxRequestsPerTick ||
        nextState.rateLimitConfig.usedBudgetUsd >= nextState.rateLimitConfig.budgetUsd
      ) {
        const req: GatewayRequest = {
          id: `req-${event.tick}-${rng.nextInt(1000, 9999)}`,
          prompt,
          queryAngleDeg: 0,
          queryEmbedding: [1, 0],
          status: 'RATE_LIMITED',
          selectedProviderId: null,
          fallbackProviderId: null,
          cacheSimilarity: 0,
          matchedCacheId: null,
          latencyMs: 1,
          costUsd: 0,
          blockedReason: 'Rate limit ceiling exceeded for current tick',
          tick: event.tick,
        };
        nextState.recentRequests.unshift(req);
        if (nextState.recentRequests.length > 20) nextState.recentRequests.pop();
        break;
      }

      nextState.rateLimitConfig.currentTickRequests += 1;

      // Guardrail Check (GW-2)
      const matchesKeyword = nextState.guardrails.blockedKeywords.some((kw) =>
        prompt.toLowerCase().includes(kw.toLowerCase()),
      );
      if ((forceInjection || matchesKeyword) && nextState.guardrails.injectionFilterEnabled) {
        nextState.guardrails.totalInjectionsBlocked += 1;
        const req: GatewayRequest = {
          id: `req-${event.tick}-${rng.nextInt(1000, 9999)}`,
          prompt,
          queryAngleDeg: 0,
          queryEmbedding: [1, 0],
          status: 'BLOCKED',
          selectedProviderId: null,
          fallbackProviderId: null,
          cacheSimilarity: 0,
          matchedCacheId: null,
          latencyMs: 3,
          costUsd: 0,
          blockedReason: 'Adversarial Prompt Injection blocked by Pre-Execution Guardrail',
          tick: event.tick,
        };
        nextState.recentRequests.unshift(req);
        if (nextState.recentRequests.length > 20) nextState.recentRequests.pop();
        break;
      }

      // Compute query angle & embedding
      const angle = reqAngle !== undefined ? reqAngle : Math.round(rng.nextFloat() * 360);
      const rad = (angle * Math.PI) / 180;
      const queryEmbedding: [number, number] = [Math.cos(rad), Math.sin(rad)];

      // Semantic Cache Lookup (GW-3)
      let bestEntry: SemanticCacheEntry | null = null;
      let maxSim = -1;

      for (const entry of Object.values(nextState.cacheEntries)) {
        const sim = queryEmbedding[0] * entry.embedding[0] + queryEmbedding[1] * entry.embedding[1];
        if (sim > maxSim) {
          maxSim = sim;
          bestEntry = entry;
        }
      }

      if (bestEntry && maxSim >= nextState.cacheConfig.similarityThreshold) {
        // Cache Hit!
        bestEntry.hitCount += 1;
        nextState.cacheConfig.totalHits += 1;
        nextState.cacheConfig.savedCostUsd += 0.005;
        nextState.cacheConfig.savedLatencyMs += 320;

        const req: GatewayRequest = {
          id: `req-${event.tick}-${rng.nextInt(1000, 9999)}`,
          prompt,
          queryAngleDeg: angle,
          queryEmbedding,
          status: 'CACHE_HIT',
          selectedProviderId: null,
          fallbackProviderId: null,
          cacheSimilarity: Math.min(1, Math.max(-1, maxSim)),
          matchedCacheId: bestEntry.id,
          latencyMs: 14,
          costUsd: 0,
          tick: event.tick,
        };
        nextState.recentRequests.unshift(req);
        if (nextState.recentRequests.length > 20) nextState.recentRequests.pop();
        break;
      }

      // Cache Miss -> Multi-Provider Waterfall Routing (GW-1)
      nextState.cacheConfig.totalMisses += 1;

      const sortedProviders = Object.values(nextState.providers).sort((a, b) => a.priority - b.priority);
      const primary = sortedProviders[0];
      if (!primary) break;

      let chosenProvider: UpstreamProvider | null = null;
      let isFallback = false;

      if (primary.circuitBreaker.state === 'OPEN' || primary.isOutageSimulated) {
        // Primary is degraded/open -> Route to next available healthy provider
        isFallback = true;
        for (let i = 1; i < sortedProviders.length; i++) {
          const candidate = sortedProviders[i];
          if (candidate && candidate.circuitBreaker.state !== 'OPEN' && !candidate.isOutageSimulated) {
            chosenProvider = candidate;
            break;
          }
        }
      } else {
        chosenProvider = primary;
      }

      if (!chosenProvider) {
        // All upstream providers unavailable
        const req: GatewayRequest = {
          id: `req-${event.tick}-${rng.nextInt(1000, 9999)}`,
          prompt,
          queryAngleDeg: angle,
          queryEmbedding,
          status: 'FAILED',
          selectedProviderId: primary.id,
          fallbackProviderId: null,
          cacheSimilarity: maxSim > -1 ? maxSim : 0,
          matchedCacheId: null,
          latencyMs: 50,
          costUsd: 0,
          blockedReason: 'All upstream providers exhausted or in OPEN circuit breaker state',
          tick: event.tick,
        };
        nextState.recentRequests.unshift(req);
        if (nextState.recentRequests.length > 20) nextState.recentRequests.pop();
        break;
      }

      const cb = chosenProvider.circuitBreaker;
      cb.totalRequests += 1;

      // Handle provider response (or failure if outage)
      if (chosenProvider.isOutageSimulated) {
        cb.totalFailures += 1;
        cb.consecutiveFailures += 1;
        cb.consecutiveSuccesses = 0;

        if (cb.state === 'HALF_OPEN') {
          cb.state = 'OPEN';
          cb.cooldownTicksRemaining = cb.cooldownTicks;
          nextState.transitionLog.push({
            providerId: chosenProvider.id,
            from: 'HALF_OPEN',
            to: 'OPEN',
            reason: 'Probe invocation failed in HALF_OPEN',
            tick: event.tick,
          });
        } else if (cb.state === 'CLOSED' && cb.consecutiveFailures >= cb.failureThreshold) {
          cb.state = 'OPEN';
          cb.cooldownTicksRemaining = cb.cooldownTicks;
          nextState.transitionLog.push({
            providerId: chosenProvider.id,
            from: 'CLOSED',
            to: 'OPEN',
            reason: `Failure threshold reached (${cb.consecutiveFailures})`,
            tick: event.tick,
          });
        }

        const req: GatewayRequest = {
          id: `req-${event.tick}-${rng.nextInt(1000, 9999)}`,
          prompt,
          queryAngleDeg: angle,
          queryEmbedding,
          status: 'FAILED',
          selectedProviderId: isFallback ? primary.id : chosenProvider.id,
          fallbackProviderId: isFallback ? chosenProvider.id : null,
          cacheSimilarity: maxSim > -1 ? maxSim : 0,
          matchedCacheId: null,
          latencyMs: chosenProvider.latencyMs + 50,
          costUsd: 0,
          blockedReason: `Upstream error 503 from ${chosenProvider.name}`,
          primaryStateAtDispatch: primary.circuitBreaker.state,
          tick: event.tick,
        };
        nextState.recentRequests.unshift(req);
        if (nextState.recentRequests.length > 20) nextState.recentRequests.pop();
        break;
      }

      // Successful upstream execution
      cb.consecutiveFailures = 0;
      cb.consecutiveSuccesses += 1;

      if (cb.state === 'HALF_OPEN' && cb.consecutiveSuccesses >= cb.successThreshold) {
        // GW-1: HALF_OPEN -> CLOSED recovery
        cb.state = 'CLOSED';
        cb.consecutiveSuccesses = 0;
        cb.lastStateChangeTick = event.tick;
        nextState.transitionLog.push({
          providerId: chosenProvider.id,
          from: 'HALF_OPEN',
          to: 'CLOSED',
          reason: `Recovered: ${cb.successThreshold} consecutive probe successes`,
          tick: event.tick,
        });
      }

      const cost = Math.round(chosenProvider.costPer1kTokens * 1.5 * 10000) / 10000;
      nextState.rateLimitConfig.usedBudgetUsd += cost;

      const req: GatewayRequest = {
        id: `req-${event.tick}-${rng.nextInt(1000, 9999)}`,
        prompt,
        queryAngleDeg: angle,
        queryEmbedding,
        status: isFallback ? 'FALLBACK_ROUTED' : 'ROUTED',
        selectedProviderId: isFallback ? primary.id : chosenProvider.id,
        fallbackProviderId: isFallback ? chosenProvider.id : null,
        cacheSimilarity: maxSim > -1 ? maxSim : 0,
        matchedCacheId: null,
        latencyMs: chosenProvider.latencyMs + Math.round(rng.nextFloat() * 20),
        costUsd: cost,
        primaryStateAtDispatch: primary.circuitBreaker.state,
        tick: event.tick,
      };
      nextState.recentRequests.unshift(req);
      if (nextState.recentRequests.length > 20) nextState.recentRequests.pop();
      break;
    }
  }

  return { nextState, emittedEvents: [] };
}
