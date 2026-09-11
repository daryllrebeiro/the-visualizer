import type { DeterministicRNG } from '../../prng/deterministic-rng.js';
import {
  buildLBRing,
  lbRingLookup,
  routeRequest,
} from './load-balancer-algorithms.js';
import {
  LB_CAPS,
  type LBClusterState,
  type LBSimEvent,
} from './load-balancer-types.js';

const DEFAULT_BACKENDS = ['backend-1', 'backend-2', 'backend-3', 'backend-4'];
const EWMA_ALPHA = 0.3;

export function createDefaultLBCluster(clusterId = 'load-balancer-1'): LBClusterState {
  const backends: Record<string, LBClusterState['backends'][string]> = {};
  const smoothCurrentWeights: Record<string, number> = {};
  for (const id of DEFAULT_BACKENDS) {
    backends[id] = {
      id,
      weight: 1,
      health: 'HEALTHY',
      crashed: false,
      inFlight: 0,
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      responseTimeEwma: 0,
      dispatchCount: 0,
      drainStartTick: null,
    };
    smoothCurrentWeights[id] = 0;
  }
  return {
    clusterId,
    tick: 0,
    backends,
    backendOrder: [...DEFAULT_BACKENDS],
    routingPolicy: 'ROUND_ROBIN',
    rrCounter: 0,
    smoothCurrentWeights,
    healthChecker: { interval: 3, failureThreshold: 2, successThreshold: 2, lastCheckTick: 0 },
    connections: {},
    connectionLog: [],
    drainTimeoutTicks: 20,
    rollingDeploy: { active: false, currentIndex: 0, replacedCount: 0 },
    ring: buildLBRing(DEFAULT_BACKENDS, LB_CAPS.vnodesPerBackend),
    stickyAssignments: {},
    routingLog: [],
    stats: {
      totalDispatched: 0,
      totalDropped: 0,
      totalCompleted: 0,
      drainCompletions: 0,
      drainForceCloses: 0,
      failovers: 0,
    },
  };
}

function rebuildRing(state: LBClusterState): void {
  const eligible = state.backendOrder.filter((id) => state.backends[id]?.health === 'HEALTHY');
  state.ring = buildLBRing(eligible, LB_CAPS.vnodesPerBackend);
}

function remapStickyAssignments(state: LBClusterState): void {
  // Remap sticky sessions whose backend left the ring (failed/draining).
  for (const [sessionKey, backendId] of Object.entries(state.stickyAssignments)) {
    const backend = state.backends[backendId];
    if (!backend || backend.health !== 'HEALTHY') {
      if (state.ring.length > 0) {
        state.stickyAssignments[sessionKey] = lbRingLookup(state.ring, sessionKey);
      } else {
        delete state.stickyAssignments[sessionKey];
      }
      state.stats.failovers++;
    }
  }
}

/**
 * Weighted-distribution window reset: LB-2's statistical assertion holds
 * over a stable pool configuration. Any change to weights, routing
 * policy, or backend health invalidates the running window — counts
 * restart (documented semantics, same as live LB metric windows).
 */
function resetDispatchWindow(state: LBClusterState): void {
  for (const backend of Object.values(state.backends)) {
    backend.dispatchCount = 0;
  }
}

function dispatch(
  state: LBClusterState,
  rng: DeterministicRNG,
  sessionKey: string,
  trackConnection: boolean,
): void {
  const rrCounter = { value: state.rrCounter };
  const selection = routeRequest(
    state.routingPolicy,
    state.backends,
    state.smoothCurrentWeights,
    rrCounter,
    state.ring,
    sessionKey,
  );
  state.rrCounter = rrCounter.value;

  const selectedBackend = selection.backendId ? state.backends[selection.backendId] : undefined;
  state.routingLog.push({
    requestId: `req-${state.stats.totalDispatched + 1}`,
    sessionKey,
    backendId: selection.backendId,
    policy: state.routingPolicy,
    reasoning: selection.reasoning,
    tick: state.tick,
    // Records the ACTUAL health of the selected backend — if a buggy
    // selector ever returns an ineligible backend, this flag is false
    // and the LB-1 invariant fires.
    healthyAtDispatch: selectedBackend ? selectedBackend.health === 'HEALTHY' : false,
  });
  if (state.routingLog.length > LB_CAPS.maxRoutingLog) {
    state.routingLog.shift();
  }

  if (selection.backendId === null) {
    state.stats.totalDropped++;
    return;
  }

  const backend = state.backends[selection.backendId] as LBClusterState['backends'][string];
  backend.dispatchCount++;
  backend.inFlight++;
  state.stats.totalDispatched++;

  if (state.routingPolicy === 'CONSISTENT_HASH') {
    state.stickyAssignments[sessionKey] = selection.backendId;
  }

  if (trackConnection) {
    const connId = `conn-${state.stats.totalDispatched}`;
    const durationTicks = rng.nextInt(1, 6);
    state.connections[connId] = {
      id: connId,
      backendId: selection.backendId,
      sessionKey,
      startTick: state.tick,
      durationTicks,
    };
    if (Object.keys(state.connections).length > LB_CAPS.maxOpenConnections) {
      // Hard cap: drop the oldest open connection (surfaced via stats).
      const oldest = Object.keys(state.connections).sort(
        (a, b) =>
          (state.connections[a] as { startTick: number }).startTick -
          (state.connections[b] as { startTick: number }).startTick,
      )[0];
      if (oldest) {
        const c = state.connections[oldest] as { backendId: string };
        state.backends[c.backendId]!.inFlight = Math.max(0, state.backends[c.backendId]!.inFlight - 1);
        delete state.connections[oldest];
        state.stats.totalDropped++;
      }
    }
  }
}

function completeExpiredConnections(state: LBClusterState): void {
  for (const conn of Object.values(state.connections)) {
    if (state.tick - conn.startTick >= conn.durationTicks) {
      const backend = state.backends[conn.backendId];
      if (backend) {
        backend.inFlight = Math.max(0, backend.inFlight - 1);
        backend.responseTimeEwma =
          backend.responseTimeEwma === 0
            ? conn.durationTicks
            : EWMA_ALPHA * conn.durationTicks + (1 - EWMA_ALPHA) * backend.responseTimeEwma;
      }
      state.connectionLog.push({
        id: conn.id,
        backendId: conn.backendId,
        sessionKey: conn.sessionKey,
        startTick: conn.startTick,
        endTick: state.tick,
        durationTicks: conn.durationTicks,
      });
      if (state.connectionLog.length > LB_CAPS.maxConnectionLog) {
        state.connectionLog.shift();
      }
      delete state.connections[conn.id];
      state.stats.totalCompleted++;
    }
  }
}

function runHealthChecks(state: LBClusterState): void {
  const { interval, failureThreshold, successThreshold } = state.healthChecker;
  if (state.tick - state.healthChecker.lastCheckTick < interval) return;
  state.healthChecker.lastCheckTick = state.tick;

  let ringChanged = false;
  for (const backend of Object.values(state.backends)) {
    if (backend.crashed) {
      backend.consecutiveFailures++;
      backend.consecutiveSuccesses = 0;
      if (backend.health === 'HEALTHY' && backend.consecutiveFailures >= failureThreshold) {
        backend.health = 'UNHEALTHY';
        ringChanged = true;
      }
    } else {
      backend.consecutiveFailures = 0;
      if (backend.health === 'UNHEALTHY') {
        backend.consecutiveSuccesses++;
        if (backend.consecutiveSuccesses >= successThreshold) {
          backend.health = 'HEALTHY';
          ringChanged = true;
        }
      }
    }
  }
  if (ringChanged) {
    rebuildRing(state);
    remapStickyAssignments(state);
    resetDispatchWindow(state);
  }
}

function advanceDrains(state: LBClusterState): void {
  for (const id of [...state.backendOrder]) {
    const backend = state.backends[id];
    if (!backend || backend.health !== 'DRAINING' || backend.drainStartTick === null) continue;

    const drained = backend.inFlight === 0;
    const timedOut = state.tick - backend.drainStartTick >= state.drainTimeoutTicks;

    if (drained || timedOut) {
      if (!drained) {
        // Force-close remaining in-flight connections.
        for (const conn of Object.values(state.connections)) {
          if (conn.backendId === id) {
            backend.inFlight = Math.max(0, backend.inFlight - 1);
            delete state.connections[conn.id];
            state.stats.drainForceCloses++;
          }
        }
      }
      backend.health = 'HEALTHY';
      backend.crashed = false;
      backend.consecutiveFailures = 0;
      backend.consecutiveSuccesses = 0;
      backend.drainStartTick = null;
      state.stats.drainCompletions++;
      rebuildRing(state);
      remapStickyAssignments(state);

      if (state.rollingDeploy.active && state.rollingDeploy.currentIndex < state.backendOrder.length) {
        state.rollingDeploy.replacedCount++;
        const nextIndex = state.rollingDeploy.currentIndex + 1;
        if (nextIndex >= state.backendOrder.length) {
          state.rollingDeploy = { active: false, currentIndex: 0, replacedCount: state.rollingDeploy.replacedCount };
        } else {
          state.rollingDeploy.currentIndex = nextIndex;
          const nextId = state.backendOrder[nextIndex] as string;
          const nextBackend = state.backends[nextId];
          if (nextBackend && nextBackend.health === 'HEALTHY') {
            nextBackend.health = 'DRAINING';
            nextBackend.drainStartTick = state.tick;
          }
        }
      }
    }
  }
}

export function pureLBTransition(
  state: LBClusterState,
  event: LBSimEvent,
  rng: DeterministicRNG,
): { nextState: LBClusterState; emittedEvents: LBSimEvent[] } {
  const nextState: LBClusterState = JSON.parse(JSON.stringify(state)) as LBClusterState;
  nextState.tick = event.tick;

  switch (event.type) {
    case 'LB_REQUEST': {
      const sessionKey = event.payload.sessionKey ?? `anon-${nextState.stats.totalDispatched + 1}`;
      dispatch(nextState, rng, sessionKey, true);
      break;
    }

    case 'LB_LOAD_TEST': {
      // Load-test lane: routing decisions only, no connection objects
      // (keeps state bounded for distribution measurement).
      const count = Math.max(
        0,
        Math.min(LB_CAPS.maxLoadTestRequests, Math.floor(event.payload.count)),
      );
      const prefix = event.payload.sessionPrefix ?? 'load';
      for (let i = 0; i < count; i++) {
        dispatch(nextState, rng, `${prefix}-${i}`, false);
      }
      break;
    }

    case 'LB_SET_POLICY': {
      nextState.routingPolicy = event.payload.policy;
      resetDispatchWindow(nextState);
      break;
    }

    case 'LB_SET_WEIGHT': {
      const backend = nextState.backends[event.payload.backendId];
      if (backend) {
        backend.weight = Math.max(1, Math.min(LB_CAPS.maxWeight, Math.floor(event.payload.weight)));
        resetDispatchWindow(nextState);
      }
      break;
    }

    case 'LB_KILL_BACKEND': {
      const backend = nextState.backends[event.payload.backendId];
      if (backend && backend.health !== 'DRAINING') {
        backend.crashed = true;
        backend.consecutiveFailures = 0; // health checker counts from here
      }
      break;
    }

    case 'LB_REVIVE_BACKEND': {
      const backend = nextState.backends[event.payload.backendId];
      if (backend) {
        backend.crashed = false;
      }
      break;
    }

    case 'LB_START_DRAIN': {
      const backend = nextState.backends[event.payload.backendId];
      if (backend && backend.health === 'HEALTHY') {
        backend.health = 'DRAINING';
        backend.drainStartTick = event.tick;
        rebuildRing(nextState);
        remapStickyAssignments(nextState);
      }
      break;
    }

    case 'LB_ROLLING_DEPLOY': {
      nextState.rollingDeploy = { active: true, currentIndex: 0, replacedCount: 0 };
      const first = nextState.backendOrder[0];
      const backend = first ? nextState.backends[first] : undefined;
      if (backend && backend.health === 'HEALTHY') {
        backend.health = 'DRAINING';
        backend.drainStartTick = event.tick;
        rebuildRing(nextState);
        remapStickyAssignments(nextState);
      }
      break;
    }

    case 'TICK' as any:
    case 'LB_TICK': {
      completeExpiredConnections(nextState);
      runHealthChecks(nextState);
      advanceDrains(nextState);
      break;
    }
  }

  nextState.rngState = rng.getState();
  return { nextState, emittedEvents: [] };
}
