import type { ScenarioDefinition } from '../../engine/types.js';

export const K8S_SCENARIOS: ScenarioDefinition[] = [
  {
    id: 'k8s-rolling-update',
    title: 'Zero-Downtime Rolling Deployment (v1 → v2)',
    badge: 'Workload Rollout',
    description:
      'Triggers a progressive rolling update from api:v1.0.0 to api:v2.0.0 under maxSurge=1, maxUnavailable=0. Observe the new ReplicaSet surge up pods before the old ReplicaSet terminates pods.',
    steps: [
      '1. Baseline: 3 pods of api:v1.0.0 running across 3 worker nodes.',
      '2. Update Image: Update Deployment image to api:v2.0.0 (Revision 2).',
      '3. Reconcile Revision 2: ReplicaSet rev2 creates new pod in Pending/Running state.',
      '4. Scale Down Rev1: Once rev2 pod is healthy, ReplicaSet rev1 terminates 1 old pod.',
      '5. Complete Rollout: All 3 pods smoothly transition to v2 with zero cluster downtime.',
    ],
    actionLabel: '▶ Run Rolling Update Lab',
    tags: ['k8s', 'deployment', 'rolling-update', 'replicaset'],
  },
  {
    id: 'k8s-pod-pending-starvation',
    title: 'Resource Starvation & "Why is my Pod Pending?"',
    badge: 'Scheduler Diagnostics',
    description:
      'Attempts to scale up or deploy a large database pod (2500m CPU, 3000MiB Memory) exceeding available worker capacity. Shows how the scheduler predicate filters explain exact pending reasons.',
    steps: [
      '1. Baseline: Workers have 2000m CPU / 2048MiB Memory each.',
      '2. Heavy Request: Scale deployment to 6 replicas (total demand 3000m CPU / 3072MiB Memory).',
      '3. Predicate Evaluation: Scheduler tests 0/3 nodes: Insufficient CPU and Memory.',
      '4. Diagnostic Inspection: Pod enters Pending with causal diagnostic explaining 0/3 node fit.',
    ],
    actionLabel: '▶ Run Starvation Lab',
    tags: ['k8s', 'scheduler', 'predicates', 'pending'],
  },
  {
    id: 'k8s-node-drain',
    title: 'Node Maintenance: Cordon & Drain Eviction',
    badge: 'Cluster Operations',
    description:
      'Cordon worker-node-2 (disable scheduling) and drain active workloads. Pods are safely evicted and bin-packed onto surviving worker-node-1 and worker-node-3.',
    steps: [
      '1. Baseline: 3 pods evenly distributed across worker-1, worker-2, and worker-3.',
      '2. Cordon Node: Set worker-2 status to SchedulingDisabled.',
      '3. Drain Node: Evict all active pods on worker-2.',
      '4. Reschedule: Scheduler bin-packs evicted pods onto worker-1 and worker-3.',
    ],
    actionLabel: '▶ Run Node Drain Lab',
    tags: ['k8s', 'drain', 'cordon', 'eviction'],
  },
];
