import type { DeterministicRNG } from '../../prng/deterministic-rng.js';
import {
  evaluateRedlockAcquisition,
  writeToProtectedResource,
} from './distributed-lock-algorithms.js';
import type {
  DistributedLockClusterState,
  DistributedLockSimEvent,
  LockClientState,
  LockNodeRecord,
} from './distributed-lock-types.js';

export function createDefaultDistributedLockCluster(
  clusterId = 'dist-lock-1',
): DistributedLockClusterState {
  const nodes: Record<string, LockNodeRecord> = {};
  for (let i = 1; i <= 5; i++) {
    nodes[`node-${i}`] = {
      nodeId: `node-${i}`,
      heldByClient: null,
      lockValue: null,
      expiresAtTick: 0,
      fencingToken: null,
      status: 'ONLINE',
    };
  }

  const clients: Record<string, LockClientState> = {
    'client-A': {
      clientId: 'client-A',
      state: 'IDLE',
      acquiredAtTick: null,
      leaseExpiresAtTick: null,
      assignedFencingToken: null,
      gcPauseRemainingTicks: 0,
    },
    'client-B': {
      clientId: 'client-B',
      state: 'IDLE',
      acquiredAtTick: null,
      leaseExpiresAtTick: null,
      assignedFencingToken: null,
      gcPauseRemainingTicks: 0,
    },
  };

  return {
    clusterId,
    tick: 0,
    backend: 'REDLOCK',
    fencingEnabled: true,
    leaseTtlTicks: 10,
    clockDriftTicks: 1,
    maxAcquisitionTimeTicks: 2,
    nextFencingToken: 1,
    nodes,
    clients,
    protectedResource: {
      resourceId: 'storage-target-1',
      highestFencingTokenSeen: 0,
      currentValue: 'INITIAL_PAYLOAD',
      writesHistory: [],
      corruptedWritesCount: 0,
      safelyRejectedCount: 0,
    },
    flawsDemonstrated: {
      kleppmannGcPauseHazardDetected: false,
      mutualExclusionViolated: false,
      dataCorruptedWithoutFencing: false,
    },
  };
}

export function pureDistributedLockTransition(
  state: DistributedLockClusterState,
  event: DistributedLockSimEvent,
  _rng: DeterministicRNG,
): { nextState: DistributedLockClusterState; emittedEvents: DistributedLockSimEvent[] } {
  const nextState: DistributedLockClusterState = JSON.parse(
    JSON.stringify(state),
  ) as DistributedLockClusterState;
  nextState.tick = event.tick;

  switch (event.type) {
    case 'LOCK_ACQUIRE': {
      const { clientId } = event.payload;
      const client = nextState.clients[clientId];
      if (!client) break;

      const evalResult = evaluateRedlockAcquisition(
        nextState.nodes,
        clientId,
        event.tick,
        nextState.leaseTtlTicks,
        nextState.clockDriftTicks,
      );

      if (evalResult.success) {
        const token = nextState.nextFencingToken++;
        const expiresAt = event.tick + evalResult.remainingValidityTicks;

        for (const nodeId of evalResult.acquiredNodeIds) {
          const node = nextState.nodes[nodeId];
          if (node) {
            node.heldByClient = clientId;
            node.lockValue = `token-${token}`;
            node.expiresAtTick = expiresAt;
            node.fencingToken = token;
          }
        }

        client.state = 'HOLDING';
        client.acquiredAtTick = event.tick;
        client.leaseExpiresAtTick = expiresAt;
        client.assignedFencingToken = token;
      }
      break;
    }

    case 'LOCK_RELEASE': {
      const { clientId } = event.payload;
      const client = nextState.clients[clientId];
      if (!client) break;

      for (const node of Object.values(nextState.nodes)) {
        if (node.heldByClient === clientId) {
          node.heldByClient = null;
          node.lockValue = null;
          node.expiresAtTick = 0;
          node.fencingToken = null;
        }
      }

      client.state = 'RELEASED';
      break;
    }

    case 'LOCK_INJECT_GC_PAUSE': {
      const { clientId, durationTicks } = event.payload;
      const client = nextState.clients[clientId];
      if (client) {
        client.state = 'PAUSED_GC';
        client.gcPauseRemainingTicks = durationTicks;
      }
      break;
    }

    case 'LOCK_WRITE_PROTECTED_RESOURCE': {
      const { clientId, data } = event.payload;
      const client = nextState.clients[clientId];
      const token = client?.assignedFencingToken ?? null;

      // Check if client is writing after lease expired
      const isLeaseExpired = (client?.leaseExpiresAtTick ?? 0) < event.tick;
      if (isLeaseExpired && client?.state === 'HOLDING') {
        nextState.flawsDemonstrated.kleppmannGcPauseHazardDetected = true;
      }

      const { nextResource, writeResult } = writeToProtectedResource(
        nextState.protectedResource,
        clientId,
        token,
        data,
        event.tick,
        nextState.fencingEnabled,
      );

      nextState.protectedResource = nextResource;

      if (writeResult.status === 'CORRUPTED_WITHOUT_FENCING') {
        nextState.flawsDemonstrated.dataCorruptedWithoutFencing = true;
      }
      break;
    }

    case 'LOCK_TOGGLE_NODE_STATUS': {
      const { nodeId, status } = event.payload;
      const node = nextState.nodes[nodeId];
      if (node) {
        node.status = status;
      }
      break;
    }

    case 'LOCK_UPDATE_CONFIG': {
      const p = event.payload;
      if (p.backend !== undefined) nextState.backend = p.backend;
      if (p.fencingEnabled !== undefined) nextState.fencingEnabled = p.fencingEnabled;
      if (p.leaseTtlTicks !== undefined) nextState.leaseTtlTicks = p.leaseTtlTicks;
      break;
    }

    case 'TICK' as any:
    case 'LOCK_TICK': {
      // Advance GC pause counters
      for (const client of Object.values(nextState.clients)) {
        if (client.state === 'PAUSED_GC') {
          client.gcPauseRemainingTicks = Math.max(0, client.gcPauseRemainingTicks - 1);
          if (client.gcPauseRemainingTicks === 0) {
            // GC pause finished: client resumes execution believing it still holds the lock!
            client.state = 'HOLDING';
          }
        }
      }

      // Check for node lease expiry
      for (const node of Object.values(nextState.nodes)) {
        if (node.heldByClient && node.expiresAtTick <= event.tick) {
          node.heldByClient = null;
          node.lockValue = null;
          node.fencingToken = null;
        }
      }

      // Check naive mutual exclusion violation (two clients both believing they are HOLDING)
      const holdingClients = Object.values(nextState.clients).filter((c) => c.state === 'HOLDING');
      if (holdingClients.length > 1) {
        nextState.flawsDemonstrated.mutualExclusionViolated = true;
      }
      break;
    }
  }

  nextState.rngState = _rng.getState();
  return { nextState, emittedEvents: [] };
}
