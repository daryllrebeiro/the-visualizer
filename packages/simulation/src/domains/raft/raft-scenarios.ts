import type { ScenarioDefinition } from '../../engine/types.js';

export const RAFT_SCENARIOS: ScenarioDefinition[] = [
  {
    id: 'raft-election-race',
    title: 'Randomized Election Timeout Race',
    badge: 'Consensus Core',
    description:
      'Demonstrates Raft leader election where nodes tick down randomized election countdown timers. The fastest candidate claims leadership through quorum votes.',
    steps: [
      '1. Countdown: Staggered randomized election timers tick down across 5 follower nodes.',
      '2. Candidate: Node 1 timer expires first, bumps term to 1, votes for self, broadcasts RequestVote.',
      '3. Quorum: Nodes 2 and 3 grant votes. Node 1 establishes majority (3/5) and becomes Leader.',
      '4. Heartbeat: Leader Node 1 broadcasts periodic AppendEntries heartbeats to reset follower timers.',
    ],
    actionLabel: '▶ Run Election Race',
    tags: ['raft', 'consensus', 'election'],
  },
  {
    id: 'raft-split-brain-partition',
    title: 'Network Partition & Quorum Majority Isolation',
    badge: 'Fault Tolerance',
    description:
      'Partitions a 5-node cluster into a Minority partition {1, 2} and Majority partition {3, 4, 5}. Shows how the majority elects a new leader and continues committing writes, while the minority is safely fenced.',
    steps: [
      '1. Partition: Cut network between {1, 2} and {3, 4, 5}.',
      '2. Election: Majority group {3, 4, 5} elects a new Leader (Node 3) at higher term.',
      '3. Write Isolation: Writes to minority cannot reach quorum; writes to majority successfully commit.',
      '4. Heal: Network heals; former Leader Node 1 discovers higher term and steps down to Follower.',
    ],
    actionLabel: '▶ Run Split-Brain Lab',
    tags: ['raft', 'chaos', 'network-partition'],
  },
  {
    id: 'raft-log-reconciliation',
    title: 'Uncommitted Entry Truncation & Catchup',
    badge: 'Log Replication',
    description:
      'Demonstrates Raft log reconciliation when a former leader had uncommitted entries before crashing. The new leader overwrites conflicting uncommitted logs with authoritative committed entries.',
    steps: [
      '1. Client Write: Leader Node 1 writes uncommitted log entry and immediately crashes.',
      '2. Successor: Node 2 is elected Leader for the new term and commits subsequent operations.',
      '3. Recovery: Node 1 recovers from crash as Follower.',
      '4. Reconciliation: Node 2 sends AppendEntries; Node 1 truncates conflicting uncommitted entries and catches up.',
    ],
    actionLabel: '▶ Run Log Reconciliation',
    tags: ['raft', 'log-matching', 'reconciliation'],
  },
];
