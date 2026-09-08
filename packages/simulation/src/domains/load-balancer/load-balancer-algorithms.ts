/**
 * Load Balancer routing algorithms — pure functions over backend state.
 *
 * Every selector returns the chosen backend id plus a human-readable
 * reasoning line for the routing-decision animation. Eligibility:
 * HEALTHY backends only (LB-1: no new connections to UNHEALTHY or
 * DRAINING backends, ever).
 */

import { fnv1a32 } from '../consistent-hashing/consistent-hashing-algorithms.js';
import type { LBBackend, LBRoutingPolicy } from './load-balancer-types.js';

export interface RouteSelection {
  backendId: string | null;
  reasoning: string;
}

export function eligibleBackends(backends: Readonly<Record<string, LBBackend>>): LBBackend[] {
  return Object.values(backends).filter((b) => b.health === 'HEALTHY');
}

/** nginx smooth weighted round-robin step. Mutates currentWeights. */
export function smoothWeightedRoundRobin(
  eligible: LBBackend[],
  currentWeights: Record<string, number>,
): LBBackend | null {
  if (eligible.length === 0) return null;
  for (const b of eligible) {
    currentWeights[b.id] = (currentWeights[b.id] ?? 0) + b.weight;
  }
  const totalWeight = eligible.reduce((acc, b) => acc + b.weight, 0);
  let best: LBBackend | null = null;
  let bestWeight = -Infinity;
  for (const b of eligible) {
    const w = currentWeights[b.id] ?? 0;
    if (w > bestWeight) {
      bestWeight = w;
      best = b;
    }
  }
  if (best) {
    currentWeights[best.id] = bestWeight - totalWeight;
  }
  return best;
}

/** Round robin: strict cycling over eligible backends in stable order. */
export function roundRobinSelect(
  eligible: LBBackend[],
  rrCounter: number,
): { backend: LBBackend | null; nextCounter: number } {
  if (eligible.length === 0) return { backend: null, nextCounter: rrCounter };
  const idx = rrCounter % eligible.length;
  return { backend: eligible[idx] as LBBackend, nextCounter: rrCounter + 1 };
}

/** Least connections: argmin(inFlight), deterministic tie-break by id. */
export function leastConnectionsSelect(eligible: LBBackend[]): LBBackend | null {
  if (eligible.length === 0) return null;
  const sorted = [...eligible].sort(
    (a, b) => a.inFlight - b.inFlight || a.id.localeCompare(b.id),
  );
  return sorted[0] as LBBackend;
}

/** Least response time: argmin(EWMA), deterministic tie-break by id. */
export function leastResponseTimeSelect(eligible: LBBackend[]): LBBackend | null {
  if (eligible.length === 0) return null;
  const sorted = [...eligible].sort(
    (a, b) => a.responseTimeEwma - b.responseTimeEwma || a.id.localeCompare(b.id),
  );
  return sorted[0] as LBBackend;
}

// ── Consistent-hash ring (sticky sessions, Karger et al. 1997) ─────────────

const LB_RING_SEED = 0x5bf03635;

/** Build the ring over the given backend ids with V vnodes each. */
export function buildLBRing(
  backendIds: ReadonlyArray<string>,
  vnodes: number,
): Array<{ position: number; backendId: string }> {
  const ring: Array<{ position: number; backendId: string }> = [];
  for (const id of backendIds) {
    for (let v = 0; v < vnodes; v++) {
      ring.push({ position: fnv1a32(`${id}#lbv${v}`, LB_RING_SEED), backendId: id });
    }
  }
  ring.sort((a, b) => a.position - b.position);
  return ring;
}

/** First vnode at-or-after the key hash (wrap-around), binary search. */
export function lbRingLookup(
  ring: ReadonlyArray<{ position: number; backendId: string }>,
  key: string,
): string {
  if (ring.length === 0) {
    throw new Error('lbRingLookup: empty ring');
  }
  const h = fnv1a32(`lbsession::${key}`, 0x811c9dc5);
  let lo = 0;
  let hi = ring.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((ring[mid] as { position: number }).position <= h) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  const idx = lo === ring.length ? 0 : lo;
  return (ring[idx] as { backendId: string }).backendId;
}

/** Full policy dispatch: selection + reasoning line. */
export function routeRequest(
  policy: LBRoutingPolicy,
  backends: Readonly<Record<string, LBBackend>>,
  smoothCurrentWeights: Record<string, number>,
  rrCounter: { value: number },
  ring: ReadonlyArray<{ position: number; backendId: string }>,
  sessionKey: string,
): RouteSelection {
  const eligible = eligibleBackends(backends);
  if (eligible.length === 0) {
    return { backendId: null, reasoning: 'no eligible healthy backend — request dropped' };
  }

  switch (policy) {
    case 'ROUND_ROBIN': {
      const { backend, nextCounter } = roundRobinSelect(eligible, rrCounter.value);
      rrCounter.value = nextCounter;
      if (!backend) return { backendId: null, reasoning: 'no eligible backend' };
      return {
        backendId: backend.id,
        reasoning: `round robin: next in cycle -> ${backend.id} (in-flight ${backend.inFlight})`,
      };
    }
    case 'WEIGHTED_RR': {
      const backend = smoothWeightedRoundRobin(eligible, smoothCurrentWeights);
      if (!backend) return { backendId: null, reasoning: 'no eligible backend' };
      return {
        backendId: backend.id,
        reasoning: `smooth weighted round-robin: weight ${backend.weight} -> ${backend.id}`,
      };
    }
    case 'LEAST_CONNECTIONS': {
      const backend = leastConnectionsSelect(eligible);
      if (!backend) return { backendId: null, reasoning: 'no eligible backend' };
      const others = eligible
        .filter((b) => b.id !== backend.id)
        .slice(0, 3)
        .map((b) => `${b.id}=${b.inFlight}`)
        .join(', ');
      return {
        backendId: backend.id,
        reasoning: `least connections: ${backend.id} has ${backend.inFlight}${others ? ` (< ${others})` : ''} -> routed to ${backend.id}`,
      };
    }
    case 'LEAST_RESPONSE_TIME': {
      const backend = leastResponseTimeSelect(eligible);
      if (!backend) return { backendId: null, reasoning: 'no eligible backend' };
      return {
        backendId: backend.id,
        reasoning: `least response time: ${backend.id} EWMA ${backend.responseTimeEwma.toFixed(2)} ticks`,
      };
    }
    case 'CONSISTENT_HASH': {
      const backendId = lbRingLookup(ring, sessionKey);
      const backend = backends[backendId];
      if (!backend || backend.health !== 'HEALTHY') {
        return { backendId: null, reasoning: 'ring lookup landed on ineligible backend' };
      }
      return {
        backendId,
        reasoning: `consistent hash: session "${sessionKey}" -> ring successor ${backendId} (sticky)`,
      };
    }
  }
}
