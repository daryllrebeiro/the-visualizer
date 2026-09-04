import type { IdGenClusterState } from './id-gen-types.js';

export interface IdGenInvariantViolation {
  ruleId: 'ID-1' | 'ID-2' | 'ID-3' | 'ID-4';
  invariantName: string;
  description: string;
  isPedagogicalFlaw?: boolean;
  pedagogicalNote?: string;
  affectedEntities: string[];
}

export class IdGenInvariantChecker {
  public check(state: IdGenClusterState): IdGenInvariantViolation | undefined {
    // ID-1: Global Uniqueness
    if (state.flawsDemonstrated.duplicateIdDetected) {
      return {
        ruleId: 'ID-1',
        invariantName: 'Global Uniqueness Collision',
        description: 'Duplicate ID generated across simulated worker fleet',
        affectedEntities: ['generatedIds'],
      };
    }

    // ID-2: Per-Worker Monotonicity (Snowflake)
    if (state.generatorType === 'SNOWFLAKE') {
      const perWorkerIds: Record<number, bigint[]> = {};
      for (const rec of state.generatedIds) {
        if (!perWorkerIds[rec.workerId]) perWorkerIds[rec.workerId] = [];
        perWorkerIds[rec.workerId]!.push(BigInt(rec.id));
      }

      for (const [wId, idList] of Object.entries(perWorkerIds)) {
        for (let i = 0; i < idList.length - 1; i++) {
          if (idList[i]! > idList[i + 1]!) {
            return {
              ruleId: 'ID-2',
              invariantName: 'Per-Worker Monotonicity Invariant Violated',
              description: `Worker ${wId} emitted out-of-order IDs: ${idList[i]} followed by ${idList[i + 1]}`,
              affectedEntities: [`worker-${wId}`],
            };
          }
        }
      }
    }

    // ID-3: Clock-Regression Refusal (Demonstrating Snowflake safety guard)
    if (state.flawsDemonstrated.clockRegressionRefusalTriggered) {
      return {
        ruleId: 'ID-3',
        invariantName: 'Backward Clock Skew Refusal Guard Active',
        description:
          'Worker refused generation because local system clock retreated behind last-seen timestamp',
        isPedagogicalFlaw: true,
        pedagogicalNote:
          'Snowflake requires the system clock to be non-decreasing. When NTP adjusts time backward, workers must pause until time catches up to prevent sequence collisions.',
        affectedEntities: ['clock-skew-guard'],
      };
    }

    return undefined;
  }
}
