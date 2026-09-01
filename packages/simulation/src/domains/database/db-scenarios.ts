import type { ScenarioDefinition } from '../../engine/types.js';

export const DB_SCENARIOS: ScenarioDefinition[] = [
  {
    id: 'db-quorum-race',
    title: 'Tunable Quorum & Stale Read Race (R + W vs N)',
    badge: 'CAP / PACELC',
    description:
      'Demonstrates the PACELC trade-off: with R=1 and W=1 on N=3, writing to one node and reading from another yields a stale value. Elevating to R=QUORUM (2) and W=QUORUM (2) guarantees strong consistency.',
    steps: [
      '1. Configure: Set Write Consistency = ONE (1), Read Consistency = ONE (1) on N=3.',
      '2. Write: Client writes key "user:100" = "version_1" (only node 1 updated).',
      '3. Stale Read: Client reads "user:100" sampled from node 2 -> stale/empty value detected.',
      '4. Elevate: Switch to R=QUORUM, W=QUORUM. Client writes "version_2" -> both nodes 1 and 2 updated.',
      '5. Read Repair: Quorum read reconciles node 3 in the background.',
    ],
    actionLabel: '▶ Run Quorum Race',
    tags: ['database', 'quorum', 'pacelc'],
  },
  {
    id: 'db-hinted-handoff',
    title: 'Hinted Handoff Fault Recovery',
    badge: 'High Availability',
    description:
      'Demonstrates how Cassandra/ScyllaDB handles writes when a replica is down by storing a hinted handoff on the coordinator, then delivering it immediately when the node recovers.',
    steps: [
      '1. Chaos: Crash Node 3.',
      '2. Write: Client writes key "order:999" = "paid" with W=QUORUM. Nodes 1 and 2 acknowledge write.',
      '3. Hint Stored: Coordinator Node 1 records a hinted handoff for missing replica Node 3.',
      '4. Recover: Node 3 is restored to ALIVE status.',
      '5. Delivery: Node 1 flushes hint to Node 3; Node 3 storage catches up seamlessly.',
    ],
    actionLabel: '▶ Run Hinted Handoff Lab',
    tags: ['database', 'hints', 'fault-recovery'],
  },
  {
    id: 'db-node-join-rebalance',
    title: 'Elastic Scale-Out & Hash Ring Token Rebalance',
    badge: 'Consistent Hashing',
    description:
      'Demonstrates adding Node 5 with 3 virtual nodes (vnodes) to the hash ring. Key ranges are automatically partitioned and migrated without full cluster downtime.',
    steps: [
      '1. Baseline: 4 nodes with 12 total vnodes distributed across the 32-bit token circle.',
      '2. Join: Node 5 joins the cluster, allocating 3 new tokens on the ring.',
      '3. Range Migration: Keys falling under Node 5 tokens are copied from predecessor nodes.',
      '4. Verification: Cluster rebalanced with 15 vnodes evenly sharing storage load.',
    ],
    actionLabel: '▶ Run Scale-Out Lab',
    tags: ['database', 'vnodes', 'consistent-hashing'],
  },
];
