import { describe, expect, it } from 'vitest';
import { DeterministicRNG } from '../../prng/deterministic-rng.js';
import { K8sInvariantChecker } from './k8s-invariants.js';
import { K8sScheduler } from './k8s-scheduler.js';
import {
  createDefaultK8sCluster,
  pureK8sTransition,
} from './k8s-state-transitions.js';
import type { K8sNode, K8sSimEvent, PodSpec } from './k8s-types.js';

describe('Kubernetes Scheduler & Reconciliation Engine', () => {
  it('should initialize 3-node cluster with default deployment and scheduled running pods', () => {
    const cluster = createDefaultK8sCluster();
    const checker = new K8sInvariantChecker();

    expect(Object.keys(cluster.nodes).length).toBe(3);
    expect(Object.keys(cluster.pods).length).toBe(3);

    const pods = Object.values(cluster.pods) as PodSpec[];
    expect(pods.every((p) => p.status === 'Running' && p.nodeName !== null)).toBe(true);
    expect(checker.check(cluster)).toBeUndefined();
  });

  it('should bin-pack pods using LeastAllocated priority scoring', () => {
    const scheduler = new K8sScheduler();
    const nodes: K8sNode[] = [
      {
        id: '1',
        name: 'w1',
        role: 'worker',
        status: 'Ready',
        capacity: { cpuMillis: 2000, memoryMb: 2048 },
        allocated: { cpuMillis: 1500, memoryMb: 1500 }, // Heavily loaded
        taints: [],
        podIds: [],
        color: '#38bdf8',
      },
      {
        id: '2',
        name: 'w2',
        role: 'worker',
        status: 'Ready',
        capacity: { cpuMillis: 2000, memoryMb: 2048 },
        allocated: { cpuMillis: 200, memoryMb: 200 }, // Lightly loaded (best score)
        taints: [],
        podIds: [],
        color: '#34d399',
      },
    ];

    const pod: PodSpec = {
      id: 'pod-test',
      name: 'test-pod',
      namespace: 'default',
      deploymentId: null,
      replicaSetId: null,
      image: 'nginx:alpine',
      resources: { cpuMillis: 250, memoryMb: 256 },
      tolerations: [],
      nodeName: null,
      status: 'Pending',
      restarts: 0,
      createdAtTick: 1,
      pendingReason: null,
    };

    const decision = scheduler.schedule(pod, nodes);
    expect(decision.selectedNode?.name).toBe('w2'); // Chose least allocated node
  });

  it('should diagnose unschedulable pod predicate failures when resources are exhausted', () => {
    const scheduler = new K8sScheduler();
    const nodes: K8sNode[] = [
      {
        id: '1',
        name: 'w1',
        role: 'worker',
        status: 'Ready',
        capacity: { cpuMillis: 1000, memoryMb: 1024 },
        allocated: { cpuMillis: 900, memoryMb: 900 },
        taints: [],
        podIds: [],
        color: '#38bdf8',
      },
    ];

    const giantPod: PodSpec = {
      id: 'giant-pod',
      name: 'giant-db',
      namespace: 'default',
      deploymentId: null,
      replicaSetId: null,
      image: 'postgres:15',
      resources: { cpuMillis: 2000, memoryMb: 4096 }, // Exceeds node capacity
      tolerations: [],
      nodeName: null,
      status: 'Pending',
      restarts: 0,
      createdAtTick: 1,
      pendingReason: null,
    };

    const decision = scheduler.schedule(giantPod, nodes);
    expect(decision.selectedNode).toBeNull();
    expect(decision.diagnosticSummary).toContain('Insufficient CPU');
    expect(decision.diagnosticSummary).toContain('Insufficient Memory');
  });

  it('should handle rolling updates by creating new ReplicaSet and transitioning pods', () => {
    const rng = new DeterministicRNG(42);
    let state = createDefaultK8sCluster();

    // Trigger rolling update to api:v2.0.0
    const updateEv: K8sSimEvent = {
      id: 'upd-1',
      tick: 10,
      type: 'K8S_UPDATE_IMAGE',
      payload: { deploymentId: 'dep-api', newImage: 'api:v2.0.0' },
    };

    state = pureK8sTransition(state, updateEv, rng).nextState;

    // Revision 2 ReplicaSet should be created
    expect(state.deployments['dep-api']?.currentRevision).toBe(2);
    expect(state.replicaSets['rs-dep-api-rev2']).toBeDefined();
  });

  it('should evict pods on drained nodes and reschedule them onto active nodes', () => {
    const rng = new DeterministicRNG(42);
    let state = createDefaultK8sCluster();

    // Drain worker-node-2
    const drainEv: K8sSimEvent = {
      id: 'drain-2',
      tick: 20,
      type: 'K8S_NODE_DRAIN',
      payload: { nodeId: '2' },
    };

    const res = pureK8sTransition(state, drainEv, rng);

    // Node 2 should have 0 pods and status SchedulingDisabled
    expect(res.nextState.nodes['2']?.status).toBe('SchedulingDisabled');
    expect(res.nextState.nodes['2']?.podIds.length).toBe(0);

    // All pods should still be running across nodes 1 and 3
    const pods = Object.values(res.nextState.pods) as PodSpec[];
    expect(pods.every((p) => p.status === 'Running' && p.nodeName !== 'worker-node-2')).toBe(true);
  });
});
