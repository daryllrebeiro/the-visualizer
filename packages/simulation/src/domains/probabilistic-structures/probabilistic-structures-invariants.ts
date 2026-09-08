import {
  bloomLookup,
  countingBloomLookup,
  cmsEstimate,
  cuckooLookup,
  hllEstimate,
  hllStandardError,
} from './probabilistic-structures-algorithms.js';
import type { ProbabilisticStructuresClusterState } from './probabilistic-structures-types.js';

export interface ProbabilisticStructuresInvariantViolation {
  ruleId: 'PROB-1' | 'PROB-2' | 'PROB-3' | 'PROB-4';
  invariantName: string;
  description: string;
  affectedEntities: string[];
}

/**
 * State-level checks for the probabilistic-structures domain.
 *
 * PROB-1 recomputes membership for every still-present stream element
 * across the Bloom family; PROB-2 guards counting-counter bounds;
 * PROB-3 checks the HyperLogLog estimate against the true distinct
 * count with the documented z=4 margin of the 1.04/sqrt(m) standard
 * error; PROB-4 asserts the Count-Min Sketch one-sided error bound
 * (never underestimates) for every stream element.
 */
export class ProbabilisticStructuresInvariantChecker {
  public check(
    state: ProbabilisticStructuresClusterState,
  ): ProbabilisticStructuresInvariantViolation | undefined {
    // PROB-2: counting counters must stay 4-bit, never negative.
    for (let i = 0; i < state.countingBloom.counters.length; i++) {
      const c = state.countingBloom.counters[i] ?? 0;
      if (c < 0 || c > 15) {
        return {
          ruleId: 'PROB-2',
          invariantName: 'Counting Bloom Deletion Safety',
          description: `Counter ${i} = ${c} outside [0, 15] — deletion underflow/overflow broke the counting bound`,
          affectedEntities: [`counter:${i}`],
        };
      }
    }

    // PROB-1: no false negatives across the Bloom family for every
    // still-present element (inserted minus deleted). Elements the cuckoo
    // rejected at insert time (filter full) are excluded from its check —
    // rejection is surfaced, not silent, and membership was never claimed.
    for (const [element, insertCount] of Object.entries(state.streamCounts)) {
      const deleteCount = state.deleteCounts[element] ?? 0;
      if (insertCount - deleteCount <= 0) continue;
      if (!bloomLookup(state.bloom, element)) {
        return {
          ruleId: 'PROB-1',
          invariantName: 'No False Negatives (Bloom Family)',
          description: `Element ${element} is present but the standard Bloom filter tests negative — the one guarantee the Bloom family makes was broken`,
          affectedEntities: [element, 'BLOOM'],
        };
      }
      if (!countingBloomLookup(state.countingBloom, element)) {
        return {
          ruleId: 'PROB-1',
          invariantName: 'No False Negatives (Bloom Family)',
          description: `Element ${element} is present but the Counting Bloom filter tests negative after deletions of other elements`,
          affectedEntities: [element, 'COUNTING_BLOOM'],
        };
      }
      const cuckooRejections = state.cuckooRejected[element] ?? 0;
      const cuckooAccepts = insertCount - cuckooRejections;
      if (cuckooAccepts > 0 && !cuckooLookup(state.cuckoo, element)) {
        return {
          ruleId: 'PROB-1',
          invariantName: 'No False Negatives (Bloom Family)',
          description: `Element ${element} is present but the Cuckoo filter tests negative — the two-bucket lookup invariant was broken by a kick`,
          affectedEntities: [element, 'CUCKOO'],
        };
      }
    }

    // PROB-3: HLL estimate within 4 standard errors of true distinct
    // count (the 1.04/sqrt(m) bound is a standard error, not a hard
    // per-estimate bound; z=4 is the deterministic safe margin).
    if (state.distinctInserted > 0) {
      const est = hllEstimate(state.hll);
      const trueCount = state.distinctInserted;
      const margin = 4 * hllStandardError(state.hll.m) * trueCount;
      if (Math.abs(est - trueCount) > margin) {
        return {
          ruleId: 'PROB-3',
          invariantName: 'HyperLogLog Error Bound',
          description: `HLL estimate ${est} deviates from true distinct count ${trueCount} by more than 4 x (1.04/sqrt(${state.hll.m})) = ${margin.toFixed(1)}`,
          affectedEntities: ['HYPERLOGLOG'],
        };
      }
    }

    // PROB-4: Count-Min Sketch may only overestimate a true frequency.
    // CMS ground truth is the insert stream (CMS has no deletion op).
    for (const [element, insertCount] of Object.entries(state.streamCounts)) {
      const est = cmsEstimate(state.cms, element);
      if (est < insertCount) {
        return {
          ruleId: 'PROB-4',
          invariantName: 'Count-Min Sketch Overestimation-Only Bound',
          description: `CMS estimate for ${element} is ${est} but true frequency is ${insertCount} — an underestimate is impossible by construction and indicates a real bug`,
          affectedEntities: [element, 'COUNT_MIN_SKETCH'],
        };
      }
    }

    return undefined;
  }
}
