import type { RaftClusterState } from '../raft/raft-types.js';
import type {
  LockNodeRecord,
  ProtectedResourceState,
  ProtectedResourceWrite,
} from './distributed-lock-types.js';

/**
 * Evaluates Raft-backed Lease Acquisition.
 * Requires active Raft leader consensus.
 */
export function evaluateRaftLeaseAcquisition(
  raftCluster: RaftClusterState | undefined,
  _clientId: string,
  _currentTick: number,
  leaseTtlTicks: number,
): {
  success: boolean;
  leaderId: string | null;
  term: number;
  remainingValidityTicks: number;
  reason?: string;
} {
  if (!raftCluster) {
    return {
      success: false,
      leaderId: null,
      term: 0,
      remainingValidityTicks: 0,
      reason: 'RAFT_CLUSTER_UNINITIALIZED',
    };
  }

  const nodes = Object.values(raftCluster.nodes);
  const leader = nodes.find((n) => n.role === 'LEADER' && n.status === 'ALIVE');

  if (!leader) {
    return {
      success: false,
      leaderId: null,
      term: 0,
      remainingValidityTicks: 0,
      reason: 'NO_ACTIVE_RAFT_LEADER',
    };
  }

  // Active leader holds lease authority
  return {
    success: true,
    leaderId: leader.id,
    term: leader.currentTerm,
    remainingValidityTicks: leaseTtlTicks,
  };
}

/**
 * Evaluates Redlock Quorum across independent nodes.
 * Quorum = floor(N / 2) + 1.
 * Validity Time = TTL - elapsedTime - clockDrift.
 */
export function evaluateRedlockAcquisition(
  nodes: Record<string, LockNodeRecord>,
  _clientId: string,
  currentTick: number,
  ttlTicks: number,
  driftTicks: number,
  simulatedElapsedTicks = 1,
): {
  success: boolean;
  acquiredNodeIds: string[];
  remainingValidityTicks: number;
  quorumReached: boolean;
} {
  const nodeList = Object.values(nodes);
  const totalNodes = nodeList.length;
  const quorumThreshold = Math.floor(totalNodes / 2) + 1;

  const acquiredNodeIds: string[] = [];

  for (const node of nodeList) {
    if (node.status !== 'ONLINE') continue;

    // Node grants lock if unheld or expired
    const isExpired = node.expiresAtTick <= currentTick;
    if (!node.heldByClient || isExpired) {
      acquiredNodeIds.push(node.nodeId);
    }
  }

  const quorumReached = acquiredNodeIds.length >= quorumThreshold;
  const remainingValidityTicks = ttlTicks - simulatedElapsedTicks - driftTicks;

  const success = quorumReached && remainingValidityTicks > 0;

  return {
    success,
    acquiredNodeIds,
    remainingValidityTicks,
    quorumReached,
  };
}

/**
 * Handles write to downstream protected resource.
 * If fencing is enabled: rejects stale tokens (Kleppmann's safety guarantee).
 * If fencing is disabled: stale writes silently corrupt data!
 */
export function writeToProtectedResource(
  resource: ProtectedResourceState,
  clientId: string,
  fencingToken: number | null,
  data: string,
  currentTick: number,
  fencingEnabled: boolean,
): {
  nextResource: ProtectedResourceState;
  writeResult: ProtectedResourceWrite;
} {
  const nextResource: ProtectedResourceState = {
    ...resource,
    writesHistory: [...resource.writesHistory],
  };

  if (fencingEnabled) {
    if (fencingToken === null || fencingToken < resource.highestFencingTokenSeen) {
      // Stale token rejected!
      const writeResult: ProtectedResourceWrite = {
        clientId,
        fencingToken,
        data,
        tick: currentTick,
        status: 'REJECTED_STALE_FENCING_TOKEN',
      };
      nextResource.writesHistory.push(writeResult);
      nextResource.safelyRejectedCount += 1;
      return { nextResource, writeResult };
    }

    // Token is higher or equal to highest seen: accept
    const writeResult: ProtectedResourceWrite = {
      clientId,
      fencingToken,
      data,
      tick: currentTick,
      status: 'ACCEPTED',
    };
    nextResource.highestFencingTokenSeen = fencingToken;
    nextResource.currentValue = data;
    nextResource.writesHistory.push(writeResult);
    return { nextResource, writeResult };
  } else {
    // Fencing DISABLED: Naive acceptance leads to out-of-order write corruption
    const writeResult: ProtectedResourceWrite = {
      clientId,
      fencingToken,
      data,
      tick: currentTick,
      status: 'CORRUPTED_WITHOUT_FENCING',
    };
    nextResource.currentValue = data;
    nextResource.writesHistory.push(writeResult);
    nextResource.corruptedWritesCount += 1;
    return { nextResource, writeResult };
  }
}
