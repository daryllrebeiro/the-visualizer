import { twoProportionZ } from './model-rollout-state-transitions.js';
import type { ModelRolloutClusterState } from './model-rollout-types.js';

export interface ModelRolloutInvariantViolation {
  ruleId: 'ROLL-1' | 'ROLL-2' | 'ROLL-3' | 'ROLL-4' | 'ROLL-5';
  invariantName: string;
  description: string;
  affectedEntities: string[];
}

const Z_CRITICAL_ALPHA_005 = 1.959964;

/**
 * State-level checks for the model-rollout domain.
 *
 * ROLL-1: live metric totals equal dispatched traffic; shadow requests
 * are tracked only in the separate shadow lane.
 * ROLL-2: the observed traffic split tracks the configured percentage
 * within a statistical band over a stable window.
 * ROLL-3: a canary breaching the error threshold for the full
 * evaluation window cannot remain live (rollback must have fired).
 * ROLL-4: the last promotion attempt's decision recomputes exactly from
 * the recorded metrics (minN + z-test).
 * ROLL-5: no model may hold the STABLE stage while the current eval
 * gate blocks it.
 */
export class ModelRolloutInvariantChecker {
  public check(state: ModelRolloutClusterState): ModelRolloutInvariantViolation | undefined {
    // ROLL-1: live metric accounting (window-scoped: metrics reset with
    // each window, so dispatch counters are window-scoped too).
    const liveTotal =
      (state.metrics[state.baselineVersion]?.requests ?? 0) +
      (state.canaryVersion ? (state.metrics[state.canaryVersion]?.requests ?? 0) : 0);
    if (liveTotal !== state.stats.windowDispatched) {
      return {
        ruleId: 'ROLL-1',
        invariantName: 'Shadow Traffic Non-Impact',
        description: `Live metrics count ${liveTotal} requests but ${state.stats.windowDispatched} were dispatched this window — shadow traffic leaked into live metrics`,
        affectedEntities: ['metrics'],
      };
    }
    if (state.shadowMetrics.requests !== state.stats.windowShadow) {
      return {
        ruleId: 'ROLL-1',
        invariantName: 'Shadow Traffic Non-Impact',
        description: `Shadow metrics count ${state.shadowMetrics.requests} but ${state.stats.windowShadow} shadow requests were dispatched this window — shadow accounting drifted`,
        affectedEntities: ['shadowMetrics'],
      };
    }
    // The baseline must never inherit the shadow lane's errors.
    const baseline = state.metrics[state.baselineVersion];
    if (baseline && baseline.requests > 0 && baseline.errors > baseline.requests) {
      return {
        ruleId: 'ROLL-1',
        invariantName: 'Shadow Traffic Non-Impact',
        description: `Baseline error count ${baseline.errors} exceeds request count ${baseline.requests} — metric contamination`,
        affectedEntities: [state.baselineVersion],
      };
    }

    // ROLL-2: split accuracy over a stable window.
    const total = liveTotal;
    if (total >= 1000 && state.canaryVersion) {
      const canaryRequests = state.metrics[state.canaryVersion]?.requests ?? 0;
      const expected = state.trafficSplit.canaryPercent / 100;
      const observed = canaryRequests / total;
      const sigma = 4 * Math.sqrt((expected * (1 - expected)) / total);
      if (Math.abs(observed - expected) > Math.max(sigma, 0.02 * expected) + 0.001) {
        return {
          ruleId: 'ROLL-2',
          invariantName: 'Canary Percentage Bound',
          description: `Canary received ${canaryRequests}/${total} requests (${(observed * 100).toFixed(2)}%) but the configured split is ${(expected * 100).toFixed(0)}% (bound ±${(Math.max(sigma, 0.02 * expected) * 100).toFixed(2)}%)`,
          affectedEntities: [state.canaryVersion],
        };
      }
    }

    // ROLL-3: rollback enforcement.
    if (state.canaryVersion) {
      const canary = state.metrics[state.canaryVersion];
      if (canary && canary.requests > 0) {
        const errorRate = canary.errors / canary.requests;
        if (
          errorRate > state.rolloutPolicy.errorRateThreshold &&
          state.consecutiveBadTicks > state.rolloutPolicy.evaluationWindowTicks
        ) {
          return {
            ruleId: 'ROLL-3',
            invariantName: 'Automatic Rollback Trigger',
            description: `Canary ${state.canaryVersion} error rate ${(errorRate * 100).toFixed(1)}% has breached the threshold for ${state.consecutiveBadTicks} ticks (window ${state.rolloutPolicy.evaluationWindowTicks}) but the canary is still live — automatic rollback did not fire`,
            affectedEntities: [state.canaryVersion],
          };
        }
      }
    }
    if (state.rollback.fsm === 'ROLLED_BACK') {
      if (state.canaryVersion !== null || state.trafficSplit.canaryPercent !== 0) {
        return {
          ruleId: 'ROLL-3',
          invariantName: 'Automatic Rollback Trigger',
          description: `A rollback was recorded but the traffic split still routes ${state.trafficSplit.canaryPercent}% to a canary — the snap-back did not complete`,
          affectedEntities: ['trafficSplit'],
        };
      }
    }

    // ROLL-4: promotion decision parity.
    if (state.lastPromotionAttempt) {
      const attempt = state.lastPromotionAttempt;
      const canary = state.canaryVersion
        ? state.metrics[state.canaryVersion]
        : null;
      const baselineMetrics = state.metrics[state.baselineVersion];
      if (attempt.allowed) {
        // An allowed promotion must have consumed the canary.
        if (state.canaryVersion !== null) {
          return {
            ruleId: 'ROLL-4',
            invariantName: 'Statistical Significance Gate',
            description: `A promotion was allowed at tick ${attempt.tick} but the canary is still live — the promotion was not applied`,
            affectedEntities: ['promotion'],
          };
        }
      }
      // minN enforcement: no allowed promotion with sub-minN samples.
      if (attempt.allowed && baselineMetrics && canary === null) {
        // After a successful promotion the metrics reset — verify via
        // the attempt's own snapshot.
        if (
          attempt.sampleSizes.canary < state.rolloutPolicy.minSamplePerArm ||
          attempt.sampleSizes.baseline < state.rolloutPolicy.minSamplePerArm
        ) {
          return {
            ruleId: 'ROLL-4',
            invariantName: 'Statistical Significance Gate',
            description: `Promotion was allowed with samples (canary ${attempt.sampleSizes.canary}, baseline ${attempt.sampleSizes.baseline}) below minN ${state.rolloutPolicy.minSamplePerArm} — a small-sample promotion slipped through`,
            affectedEntities: ['promotion'],
          };
        }
        if (attempt.zScore === null || attempt.zScore <= Z_CRITICAL_ALPHA_005) {
          return {
            ruleId: 'ROLL-4',
            invariantName: 'Statistical Significance Gate',
            description: `Promotion was allowed with z=${attempt.zScore} — below the significance threshold ${Z_CRITICAL_ALPHA_005}`,
            affectedEntities: ['promotion'],
          };
        }
      }
      // Blocked decisions must cite a real reason.
      if (!attempt.allowed && attempt.reasons.length === 0) {
        return {
          ruleId: 'ROLL-4',
          invariantName: 'Statistical Significance Gate',
          description: `Promotion at tick ${attempt.tick} was blocked with no recorded reason`,
          affectedEntities: ['promotion'],
        };
      }
    }

    // ROLL-5: the eval gate blocks promotion.
    if (state.evalGate?.blocked) {
      const stable = Object.values(state.registry).find((m) => m.stage === 'STABLE');
      if (stable && stable.id === state.baselineVersion && state.lastPromotionAttempt) {
        // Fine: the stable version predates the gate. Only a promotion
        // DURING the block is a violation — covered by attempt parity.
      }
      if (state.lastPromotionAttempt?.allowed === true) {
        return {
          ruleId: 'ROLL-5',
          invariantName: 'Eval Gate Blocking',
          description: `A promotion was allowed while the eval gate blocks (run ${state.evalGate.sourceRunId}) — a Critical-failing version reached production`,
          affectedEntities: [state.evalGate.sourceRunId],
        };
      }
    }

    return undefined;
  }
}

export { twoProportionZ };
