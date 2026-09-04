import type { DeterministicRNG } from '../../prng/deterministic-rng.js';
import type {
  GeneratedIdRecord,
  IdGenClusterState,
  IdGenSimEvent,
  IdWorkerState,
} from './id-gen-types.js';
import {
  decomposeSnowflake,
  generateDeterministicUuidV4,
  generateDeterministicUuidV7,
  generateSnowflakeBigInt,
} from './snowflake-generator.js';

export function createDefaultWorker(workerId: number, name: string): IdWorkerState {
  return {
    workerId,
    name,
    currentTickMs: 1000,
    lastSeenTickMs: 1000,
    sequence: 0,
    status: 'ACTIVE',
    totalGenerated: 0,
  };
}

export function createDefaultIdGenCluster(clusterId = 'id-gen-cluster-1'): IdGenClusterState {
  return {
    clusterId,
    tick: 0,
    generatorType: 'SNOWFLAKE',
    customEpochMs: 1704067200000, // Jan 1, 2024
    refuseOnBackwardClock: true,
    workers: {
      1: createDefaultWorker(1, 'worker-us-east-1'),
      2: createDefaultWorker(2, 'worker-us-west-1'),
      3: createDefaultWorker(3, 'worker-eu-west-1'),
      4: createDefaultWorker(4, 'worker-ap-south-1'),
    },
    generatedIds: [],
    flawsDemonstrated: {
      duplicateIdDetected: false,
      clockRegressionRefusalTriggered: false,
      sequenceOverflowRolloverTriggered: false,
      duplicateWorkerIdCollisionDetected: false,
    },
  };
}

export function pureIdGenTransition(
  state: IdGenClusterState,
  event: IdGenSimEvent,
  rng: DeterministicRNG,
): { nextState: IdGenClusterState; emittedEvents: IdGenSimEvent[] } {
  const nextState: IdGenClusterState = JSON.parse(JSON.stringify(state)) as IdGenClusterState;
  nextState.tick = event.tick;

  switch (event.type) {
    case 'ID_GEN_GENERATE': {
      const { workerId, count = 1 } = event.payload;
      const worker = nextState.workers[workerId];
      if (!worker) break;

      for (let i = 0; i < count; i++) {
        // Check clock regression guard
        if (worker.currentTickMs < worker.lastSeenTickMs) {
          if (nextState.refuseOnBackwardClock) {
            worker.status = 'REFUSING_CLOCK_REGRESSION';
            nextState.flawsDemonstrated.clockRegressionRefusalTriggered = true;
            break;
          }
          // If guard disabled, worker generates despite clock skew -> risk of collision!
        } else {
          worker.status = 'ACTIVE';
        }

        // Sequence calculation
        if (worker.currentTickMs === worker.lastSeenTickMs) {
          worker.sequence = (worker.sequence + 1) & 0xfff; // 12-bit mask (4095)
          if (worker.sequence === 0) {
            // Sequence overflowed 4096: roll over to next millisecond
            worker.currentTickMs += 1;
            nextState.flawsDemonstrated.sequenceOverflowRolloverTriggered = true;
          }
        } else {
          worker.sequence = 0;
          worker.lastSeenTickMs = worker.currentTickMs;
        }

        let idString = '';
        let snowflakeFields = undefined;
        let isSortable = true;

        if (nextState.generatorType === 'SNOWFLAKE') {
          const rawBigInt = generateSnowflakeBigInt(
            worker.currentTickMs,
            worker.workerId,
            worker.sequence,
          );
          idString = rawBigInt.toString(10);
          snowflakeFields = decomposeSnowflake(rawBigInt);
          isSortable = true;
        } else if (nextState.generatorType === 'UUID_V4') {
          idString = generateDeterministicUuidV4(rng);
          isSortable = false;
        } else if (nextState.generatorType === 'UUID_V7') {
          idString = generateDeterministicUuidV7(
            nextState.customEpochMs + worker.currentTickMs,
            rng,
          );
          isSortable = true;
        }

        // Collision detection
        const alreadyExists = nextState.generatedIds.some((r) => r.id === idString);
        if (alreadyExists) {
          nextState.flawsDemonstrated.duplicateIdDetected = true;
        }

        const record: GeneratedIdRecord = {
          id: idString,
          type: nextState.generatorType,
          workerId: worker.workerId,
          tickMs: worker.currentTickMs,
          sequence: worker.sequence,
          snowflakeFields,
          isSortable,
        };

        nextState.generatedIds.push(record);
        if (nextState.generatedIds.length > 200) {
          nextState.generatedIds.shift();
        }

        worker.totalGenerated += 1;
      }
      break;
    }

    case 'ID_GEN_INJECT_CLOCK_SKEW': {
      const { workerId, backwardSkewMs } = event.payload;
      const worker = nextState.workers[workerId];
      if (worker) {
        worker.currentTickMs = Math.max(0, worker.currentTickMs - backwardSkewMs);
        if (nextState.refuseOnBackwardClock) {
          worker.status = 'REFUSING_CLOCK_REGRESSION';
          nextState.flawsDemonstrated.clockRegressionRefusalTriggered = true;
        }
      }
      break;
    }

    case 'ID_GEN_FLOOD_OVERFLOW': {
      const { workerId, burstCount } = event.payload;
      const subEvent: IdGenSimEvent = {
        id: `${event.id}-flood`,
        tick: event.tick,
        type: 'ID_GEN_GENERATE',
        payload: { workerId, count: burstCount },
      };
      const res = pureIdGenTransition(nextState, subEvent, rng);
      Object.assign(nextState, res.nextState);
      break;
    }

    case 'ID_GEN_ASSIGN_DUPLICATE_WORKER': {
      const { conflictingWorkerId } = event.payload;
      // Intentionally configure worker 4 with the same workerId as worker 1
      if (nextState.workers[4]) {
        nextState.workers[4]!.workerId = conflictingWorkerId;
        nextState.flawsDemonstrated.duplicateWorkerIdCollisionDetected = true;
      }
      break;
    }

    case 'ID_GEN_UPDATE_CONFIG': {
      const p = event.payload;
      if (p.generatorType !== undefined) nextState.generatorType = p.generatorType;
      if (p.refuseOnBackwardClock !== undefined)
        nextState.refuseOnBackwardClock = p.refuseOnBackwardClock;
      break;
    }

    case 'TICK' as any:
    case 'ID_GEN_TICK': {
      // Advance clock milliseconds across all workers
      for (const worker of Object.values(nextState.workers)) {
        worker.currentTickMs += 1;
        if (worker.currentTickMs >= worker.lastSeenTickMs) {
          worker.status = 'ACTIVE';
        }
      }
      break;
    }
  }

  nextState.rngState = rng.getState();
  return { nextState, emittedEvents: [] };
}
