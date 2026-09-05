/**
 * Distributed Lock Simulation Types & State Model
 *
 * References:
 * - Salvatore Sanfilippo: Distributed Locks with Redis (Redlock Algorithm)
 * - Martin Kleppmann (2016): How to do distributed locking
 * - Mike Burrows (2006): Chubby lock service
 */

export type LockBackendType = 'REDLOCK' | 'RAFT_LEASE';

export interface LockNodeRecord {
  nodeId: string;
  heldByClient: string | null;
  lockValue: string | null;
  expiresAtTick: number;
  fencingToken: number | null;
  status: 'ONLINE' | 'PARTITIONED' | 'DOWN';
}

export interface LockClientState {
  clientId: string;
  state: 'IDLE' | 'ACQUIRING' | 'HOLDING' | 'RENEWING' | 'PAUSED_GC' | 'RELEASED';
  acquiredAtTick: number | null;
  leaseExpiresAtTick: number | null;
  assignedFencingToken: number | null;
  gcPauseRemainingTicks: number;
}

export interface ProtectedResourceWrite {
  clientId: string;
  fencingToken: number | null;
  data: string;
  tick: number;
  status: 'ACCEPTED' | 'REJECTED_STALE_FENCING_TOKEN' | 'CORRUPTED_WITHOUT_FENCING';
}

export interface ProtectedResourceState {
  resourceId: string;
  highestFencingTokenSeen: number;
  currentValue: string;
  writesHistory: ProtectedResourceWrite[];
  corruptedWritesCount: number;
  safelyRejectedCount: number;
}

import type { RaftClusterState } from '../raft/raft-types.js';

export interface DistributedLockClusterState {
  clusterId: string;
  tick: number;
  rngState?: number;
  backend: LockBackendType;
  fencingEnabled: boolean;
  leaseTtlTicks: number;
  clockDriftTicks: number;
  maxAcquisitionTimeTicks: number;
  nextFencingToken: number;
  nodes: Record<string, LockNodeRecord>;
  clients: Record<string, LockClientState>;
  protectedResource: ProtectedResourceState;
  raftCluster?: RaftClusterState;
  raftLease?: {
    leaderId: string | null;
    term: number;
    grantedAtTick: number;
    expiresAtTick: number;
  } | null;
  flawsDemonstrated: {
    kleppmannGcPauseHazardDetected: boolean;
    mutualExclusionViolated: boolean;
    dataCorruptedWithoutFencing: boolean;
  };
}

export type DistributedLockSimEvent =
  | {
      id: string;
      tick: number;
      type: 'LOCK_ACQUIRE';
      payload: {
        clientId: string;
        resourceId?: string;
      };
    }
  | {
      id: string;
      tick: number;
      type: 'LOCK_RELEASE';
      payload: {
        clientId: string;
      };
    }
  | {
      id: string;
      tick: number;
      type: 'LOCK_RENEW';
      payload: {
        clientId: string;
      };
    }
  | {
      id: string;
      tick: number;
      type: 'LOCK_INJECT_GC_PAUSE';
      payload: {
        clientId: string;
        durationTicks: number;
      };
    }
  | {
      id: string;
      tick: number;
      type: 'LOCK_WRITE_PROTECTED_RESOURCE';
      payload: {
        clientId: string;
        data: string;
      };
    }
  | {
      id: string;
      tick: number;
      type: 'LOCK_TOGGLE_NODE_STATUS';
      payload: {
        nodeId: string;
        status: 'ONLINE' | 'PARTITIONED' | 'DOWN';
      };
    }
  | {
      id: string;
      tick: number;
      type: 'LOCK_UPDATE_CONFIG';
      payload: {
        backend?: LockBackendType;
        fencingEnabled?: boolean;
        leaseTtlTicks?: number;
      };
    }
  | {
      id: string;
      tick: number;
      type: 'LOCK_TICK';
      payload: Record<string, unknown>;
    };
