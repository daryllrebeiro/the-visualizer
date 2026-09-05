/**
 * Distributed ID Generation Simulation Types & State Model
 *
 * References:
 * - Twitter Snowflake Specification (64-bit k-ordered unique IDs)
 * - RFC 9562: Universally Unique IDentifiers (UUIDv7 & UUIDv4)
 * - Sonyflake & Instagram Distributed Sharded ID schemes
 */

export type IdGeneratorType = 'SNOWFLAKE' | 'UUID_V4' | 'UUID_V7';

export interface SnowflakeDecomposition {
  rawIdString: string;
  signBit: number; // 1 bit (always 0)
  timestampDeltaMs: number; // 41 bits
  workerId: number; // 10 bits (0..1023)
  sequence: number; // 12 bits (0..4095)
  formattedBinary: string;
}

export interface GeneratedIdRecord {
  id: string;
  type: IdGeneratorType;
  workerId: number;
  tickMs: number;
  sequence: number;
  snowflakeFields?: SnowflakeDecomposition | undefined;
  isSortable: boolean;
}

export interface IdWorkerState {
  workerId: number;
  name: string;
  currentTickMs: number;
  lastSeenTickMs: number;
  sequence: number;
  status: 'ACTIVE' | 'REFUSING_CLOCK_REGRESSION' | 'BLOCKED_SEQUENCE_OVERFLOW';
  totalGenerated: number;
}

import type { RaftClusterState } from '../raft/raft-types.js';

export type WorkerRegistryMode = 'STATIC' | 'RAFT_CONSENSUS';

export interface IdGenClusterState {
  clusterId: string;
  tick: number;
  rngState?: number;
  generatorType: IdGeneratorType;
  workerRegistryMode: WorkerRegistryMode;
  customEpochMs: number; // e.g. 1704067200000 (Jan 1, 2024 UTC)
  refuseOnBackwardClock: boolean;
  workers: Record<number, IdWorkerState>;
  registeredWorkerIds: Record<number, { registeredAtTick: number; term: number; status: 'ACTIVE' | 'REVOKED' }>;
  raftCluster?: RaftClusterState;
  generatedIds: GeneratedIdRecord[];
  flawsDemonstrated: {
    duplicateIdDetected: boolean;
    clockRegressionRefusalTriggered: boolean;
    sequenceOverflowRolloverTriggered: boolean;
    duplicateWorkerIdCollisionDetected: boolean;
  };
}

export type IdGenSimEvent =
  | {
      id: string;
      tick: number;
      type: 'ID_GEN_GENERATE';
      payload: {
        workerId: number;
        count?: number;
      };
    }
  | {
      id: string;
      tick: number;
      type: 'ID_GEN_REGISTER_WORKER_RAFT';
      payload: {
        workerId: number;
        workerName?: string;
      };
    }
  | {
      id: string;
      tick: number;
      type: 'ID_GEN_INJECT_CLOCK_SKEW';
      payload: {
        workerId: number;
        backwardSkewMs: number;
      };
    }
  | {
      id: string;
      tick: number;
      type: 'ID_GEN_FLOOD_OVERFLOW';
      payload: {
        workerId: number;
        burstCount: number; // e.g. 5000 to trigger 4096 12-bit overflow
      };
    }
  | {
      id: string;
      tick: number;
      type: 'ID_GEN_ASSIGN_DUPLICATE_WORKER';
      payload: {
        conflictingWorkerId: number;
      };
    }
  | {
      id: string;
      tick: number;
      type: 'ID_GEN_UPDATE_CONFIG';
      payload: {
        generatorType?: IdGeneratorType;
        workerRegistryMode?: WorkerRegistryMode;
        refuseOnBackwardClock?: boolean;
      };
    }
  | {
      id: string;
      tick: number;
      type: 'ID_GEN_TICK';
      payload: Record<string, unknown>;
    };
