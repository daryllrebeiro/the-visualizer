import type { DeterministicRNG } from '../../prng/deterministic-rng.js';
import {
  ROLL_CAPS,
  type ModelRolloutSimEvent,
  type ModelRolloutClusterState,
  type PromotionAttempt,
  type VersionMetrics,
} from './model-rollout-types.js';

const Z_CRITICAL_ALPHA_005 = 1.959964; // one-sided 95%

function emptyMetrics(): VersionMetrics {
  return { requests: 0, errors: 0, conversions: 0, latencyTickSum: 0 };
}

export function createDefaultModelRolloutCluster(
  clusterId = 'model-rollout-1',
): ModelRolloutClusterState {
  return {
    clusterId,
    tick: 0,
    registry: {
      'model-v1': { id: 'model-v1', stage: 'STABLE' },
      'model-v2': { id: 'model-v2', stage: 'NONE' },
    },
    modelOrder: ['model-v1', 'model-v2'],
    baselineVersion: 'model-v1',
    canaryVersion: null,
    shadowVersion: null,
    shadowEnabled: false,
    trafficSplit: { baselinePercent: 100, canaryPercent: 0 },
    modelRates: {
      'model-v1': { errorRate: 0.02, conversionRate: 0.6 },
      'model-v2': { errorRate: 0.02, conversionRate: 0.6 },
    },
    metrics: {
      'model-v1': emptyMetrics(),
      'model-v2': emptyMetrics(),
    },
    shadowMetrics: emptyMetrics(),
    rolloutPolicy: {
      errorRateThreshold: 0.05,
      evaluationWindowTicks: 3,
      significanceAlpha: 0.05,
      minSamplePerArm: 1_000,
    },
    consecutiveBadTicks: 0,
    windowStartTick: 0,
    rollback: { fsm: 'HEALTHY', triggeredAtTick: null, triggerMetric: null },
    evalGate: null,
    lastPromotionAttempt: null,
    lastRollbackEvent: null,
    stats: {
      totalRequests: 0,
      shadowRequests: 0,
      windowDispatched: 0,
      windowShadow: 0,
      promotionsAttempted: 0,
      promotionsBlocked: 0,
      rollbacks: 0,
    },
  };
}

function resetWindow(state: ModelRolloutClusterState): void {
  for (const version of Object.keys(state.metrics)) {
    state.metrics[version] = emptyMetrics();
  }
  state.shadowMetrics = emptyMetrics();
  state.consecutiveBadTicks = 0;
  state.windowStartTick = state.tick;
  state.stats.windowDispatched = 0;
  state.stats.windowShadow = 0;
}

/** Two-proportion z-test (business-metric conversion, canary vs baseline). */
export function twoProportionZ(
  xCanary: number,
  nCanary: number,
  xBaseline: number,
  nBaseline: number,
): number | null {
  if (nCanary <= 0 || nBaseline <= 0) return null;
  const p1 = xCanary / nCanary;
  const p0 = xBaseline / nBaseline;
  const pooled = (xCanary + xBaseline) / (nCanary + nBaseline);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / nCanary + 1 / nBaseline));
  if (se === 0) return null;
  return (p1 - p0) / se;
}

export function pureModelRolloutTransition(
  state: ModelRolloutClusterState,
  event: ModelRolloutSimEvent,
  rng: DeterministicRNG,
): { nextState: ModelRolloutClusterState; emittedEvents: ModelRolloutSimEvent[] } {
  const nextState: ModelRolloutClusterState = JSON.parse(
    JSON.stringify(state),
  ) as ModelRolloutClusterState;
  nextState.tick = event.tick;

  switch (event.type) {
    case 'ROLL_REGISTER_MODEL': {
      if (Object.keys(nextState.registry).length >= ROLL_CAPS.maxLiveVersions) break;
      const id = event.payload.id;
      if (nextState.registry[id] !== undefined) break;
      nextState.registry[id] = { id, stage: 'NONE' };
      nextState.modelOrder.push(id);
      nextState.modelRates[id] = {
        errorRate: event.payload.errorRate ?? 0.02,
        conversionRate: event.payload.conversionRate ?? 0.6,
      };
      nextState.metrics[id] = emptyMetrics();
      break;
    }

    case 'ROLL_SET_CANARY': {
      const version = nextState.registry[event.payload.version];
      if (!version || version.id === nextState.baselineVersion) break;
      const percent = Math.max(0, Math.min(100, event.payload.percent));
      version.stage = percent > 0 ? 'CANARY' : 'NONE';
      nextState.canaryVersion = percent > 0 ? version.id : null;
      nextState.trafficSplit = { baselinePercent: 100 - percent, canaryPercent: percent };
      resetWindow(nextState);
      nextState.rollback = { fsm: 'HEALTHY', triggeredAtTick: null, triggerMetric: null };
      break;
    }

    case 'ROLL_SET_SHADOW': {
      const version = nextState.registry[event.payload.version];
      if (!version) break;
      nextState.shadowEnabled = event.payload.enabled;
      nextState.shadowVersion = event.payload.enabled ? version.id : null;
      version.stage = event.payload.enabled ? 'SHADOW' : version.stage === 'SHADOW' ? 'NONE' : version.stage;
      nextState.shadowMetrics = emptyMetrics();
      break;
    }

    case 'ROLL_SET_RATES': {
      const rates = nextState.modelRates[event.payload.version];
      if (!rates) break;
      if (event.payload.errorRate !== undefined) {
        rates.errorRate = Math.max(0, Math.min(1, event.payload.errorRate));
      }
      if (event.payload.conversionRate !== undefined) {
        rates.conversionRate = Math.max(0, Math.min(1, event.payload.conversionRate));
      }
      break;
    }

    case 'ROLL_SEND_TRAFFIC': {
      const count = Math.max(0, Math.min(ROLL_CAPS.maxTrafficBatch, Math.floor(event.payload.count)));
      const canaryPercent = nextState.trafficSplit.canaryPercent / 100;
      for (let i = 0; i < count; i++) {
        // Route: canary vs baseline (ROLL-2 split).
        const toCanary =
          nextState.canaryVersion !== null && rng.nextFloat() < canaryPercent;
        const liveVersion = toCanary
          ? (nextState.canaryVersion as string)
          : nextState.baselineVersion;
        const rates = nextState.modelRates[liveVersion] as { errorRate: number; conversionRate: number };
        const live = nextState.metrics[liveVersion] as VersionMetrics;
        live.requests++;
        if (rng.nextFloat() < rates.errorRate) {
          live.errors++;
        }
        if (rng.nextFloat() < rates.conversionRate) {
          live.conversions++;
        }
        live.latencyTickSum += rng.nextInt(1, 5);
        nextState.stats.totalRequests++;
        nextState.stats.windowDispatched++;

        // ROLL-1: shadow lane mirrors the request but can NEVER touch
        // live metrics or the client's response.
        if (nextState.shadowEnabled && nextState.shadowVersion) {
          const shadowRates = nextState.modelRates[nextState.shadowVersion] as {
            errorRate: number;
            conversionRate: number;
          };
          nextState.shadowMetrics.requests++;
          if (rng.nextFloat() < shadowRates.errorRate) {
            nextState.shadowMetrics.errors++;
          }
          if (rng.nextFloat() < shadowRates.conversionRate) {
            nextState.shadowMetrics.conversions++;
          }
          nextState.shadowMetrics.latencyTickSum += rng.nextInt(1, 30);
          nextState.stats.shadowRequests++;
          nextState.stats.windowShadow++;
        }
      }
      break;
    }

    case 'ROLL_PROMOTE': {
      nextState.stats.promotionsAttempted++;
      const reasons: string[] = [];
      let allowed = true;

      // ROLL-5: the eval gate (EVAL-4 cross-domain contract) blocks first.
      if (nextState.evalGate?.blocked) {
        allowed = false;
        reasons.push(`blocked by eval gate (run ${nextState.evalGate.sourceRunId}, policy v${nextState.evalGate.policyVersion}: critical failures)`);
      }

      // Canary must be live.
      if (!nextState.canaryVersion) {
        allowed = false;
        reasons.push('no canary version is live');
      }

      let zScore: number | null = null;
      const canaryMetrics = nextState.canaryVersion
        ? (nextState.metrics[nextState.canaryVersion] as VersionMetrics)
        : null;
      const baselineMetrics = nextState.metrics[nextState.baselineVersion] as VersionMetrics;

      if (canaryMetrics && nextState.canaryVersion) {
        // ROLL-4: sample size + statistical significance gate.
        const nCanary = canaryMetrics.requests;
        const nBaseline = baselineMetrics.requests;
        zScore = twoProportionZ(
          canaryMetrics.conversions,
          nCanary,
          baselineMetrics.conversions,
          nBaseline,
        );
        if (nCanary < nextState.rolloutPolicy.minSamplePerArm) {
          allowed = false;
          reasons.push(
            `insufficient sample: canary n=${nCanary} < minN ${nextState.rolloutPolicy.minSamplePerArm}`,
          );
        }
        if (nBaseline < nextState.rolloutPolicy.minSamplePerArm) {
          allowed = false;
          reasons.push(
            `insufficient sample: baseline n=${nBaseline} < minN ${nextState.rolloutPolicy.minSamplePerArm}`,
          );
        }
        if (zScore === null || zScore <= Z_CRITICAL_ALPHA_005) {
          allowed = false;
          reasons.push(
            zScore === null
              ? 'no measurable conversion difference (degenerate z)'
              : `not statistically significant: z=${zScore.toFixed(3)} <= ${Z_CRITICAL_ALPHA_005} at alpha=0.05`,
          );
        }

        // Canary health must be clean.
        const canaryErrorRate = canaryMetrics.errors / Math.max(1, canaryMetrics.requests);
        if (canaryErrorRate > nextState.rolloutPolicy.errorRateThreshold) {
          allowed = false;
          reasons.push(
            `canary error rate ${(canaryErrorRate * 100).toFixed(1)}% exceeds threshold ${(nextState.rolloutPolicy.errorRateThreshold * 100).toFixed(0)}%`,
          );
        }
      }

      const attempt: PromotionAttempt = {
        tick: event.tick,
        allowed,
        reasons,
        sampleSizes: {
          baseline: baselineMetrics.requests,
          canary: canaryMetrics?.requests ?? 0,
        },
        zScore,
      };
      nextState.lastPromotionAttempt = attempt;

      if (allowed && nextState.canaryVersion) {
        // Promote: canary -> STABLE at 100%; old stable -> ARCHIVED.
        const oldStable = nextState.registry[nextState.baselineVersion];
        if (oldStable) {
          oldStable.stage = 'ARCHIVED';
        }
        const promoted = nextState.registry[nextState.canaryVersion];
        if (promoted) {
          promoted.stage = 'STABLE';
        }
        nextState.baselineVersion = nextState.canaryVersion;
        nextState.canaryVersion = null;
        nextState.trafficSplit = { baselinePercent: 100, canaryPercent: 0 };
        resetWindow(nextState);
      } else {
        nextState.stats.promotionsBlocked++;
      }
      void rng.nextFloat();
      break;
    }

    case 'ROLL_SET_EVAL_GATE': {
      nextState.evalGate = { ...event.payload.gate };
      break;
    }

    case 'ROLL_CLEAR_EVAL_GATE': {
      nextState.evalGate = null;
      break;
    }

    case 'TICK' as any:
    case 'ROLL_TICK': {
      // ROLL-3: automatic rollback — canary error rate past the
      // threshold for the full evaluation window snaps traffic back to
      // the baseline with no manual intervention.
      if (nextState.canaryVersion) {
        const canaryMetrics = nextState.metrics[nextState.canaryVersion] as VersionMetrics;
        const errorRate = canaryMetrics.errors / Math.max(1, canaryMetrics.requests);
        if (
          canaryMetrics.requests > 0 &&
          errorRate > nextState.rolloutPolicy.errorRateThreshold
        ) {
          nextState.consecutiveBadTicks++;
        } else {
          nextState.consecutiveBadTicks = 0;
        }

        if (
          nextState.rollback.fsm === 'HEALTHY' &&
          nextState.consecutiveBadTicks >= nextState.rolloutPolicy.evaluationWindowTicks
        ) {
          // Threshold breached for the window: OPEN -> immediate snap-back.
          nextState.rollback = {
            fsm: 'ROLLED_BACK',
            triggeredAtTick: event.tick,
            triggerMetric: `canary error rate ${(errorRate * 100).toFixed(1)}% > threshold ${(
              nextState.rolloutPolicy.errorRateThreshold * 100
            ).toFixed(0)}%`,
          };
          const failed = nextState.registry[nextState.canaryVersion];
          if (failed) {
            failed.stage = 'ARCHIVED';
          }
          nextState.lastRollbackEvent = {
            tick: event.tick,
            version: nextState.canaryVersion,
            triggerMetric: nextState.rollback.triggerMetric as string,
          };
          nextState.canaryVersion = null;
          nextState.trafficSplit = { baselinePercent: 100, canaryPercent: 0 };
          nextState.stats.rollbacks++;
          resetWindow(nextState);
        }
      }
      void rng.nextFloat();
      break;
    }
  }

  nextState.rngState = rng.getState();
  return { nextState, emittedEvents: [] };
}
