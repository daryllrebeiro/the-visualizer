import type { TransactionsClusterState } from './transactions-types.js';

export interface TransactionsInvariantViolation {
  ruleId: 'TXN-1' | 'TXN-2' | 'TXN-3' | 'TXN-4';
  invariantName: string;
  description: string;
  isPedagogicalFlaw?: boolean;
  pedagogicalNote?: string;
  affectedEntities: string[];
}

export class TransactionsInvariantChecker {
  public check(state: TransactionsClusterState): TransactionsInvariantViolation | undefined {
    // TXN-1: 2PC Atomicity (Never mixed outcomes)
    if (state.flawsDemonstrated.mixedParticipantOutcomeDetected) {
      return {
        ruleId: 'TXN-1',
        invariantName: '2PC Atomicity Violation',
        description:
          'Participants reached conflicting outcomes: both COMMITTED and ABORTED states exist simultaneously',
        affectedEntities: Object.keys(state.twoPhaseCommit.participants),
      };
    }

    // TXN-3: Saga Compensation Ordering (Strict Reverse Order)
    if (state.flawsDemonstrated.outOfOrderCompensationDetected) {
      return {
        ruleId: 'TXN-3',
        invariantName: 'Saga Compensation Ordering Violation',
        description: 'Compensating transactions executed out of reverse-LIFO order',
        affectedEntities: ['saga-orchestrator'],
      };
    }

    // TXN-2: 2PC Blocking Hazard (Intentionally-demonstrable pedagogical flaw)
    if (state.flawsDemonstrated.twoPhaseCommitBlockingHazardDetected) {
      return {
        ruleId: 'TXN-2',
        invariantName: '2PC Coordinator Crash Blocking Hazard',
        description:
          'Coordinator crashed after PREPARE phase, leaving participants in BLOCKED_UNCERTAIN state unable to make unilateral commit/abort decisions',
        isPedagogicalFlaw: true,
        pedagogicalNote:
          'Jim Gray (1978) established that Two-Phase Commit is a blocking protocol: if the coordinator crashes while participants are in the PREPARED state, participants must remain blocked indefinitely until the coordinator recovers or a cooperative termination protocol completes.',
        affectedEntities: ['coordinator', ...Object.keys(state.twoPhaseCommit.participants)],
      };
    }

    return undefined;
  }
}
