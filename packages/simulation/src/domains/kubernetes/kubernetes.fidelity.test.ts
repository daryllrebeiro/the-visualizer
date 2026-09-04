import { describe, expect, it } from 'vitest';
import { DeterministicRNG } from '../../prng/deterministic-rng.js';
import { K8sScheduler } from './k8s-scheduler.js';
import {
  createDefaultK8sCluster,
  pureK8sTransition,
} from './k8s-state-transitions.js';
import type { K8sNode, K8sSimEvent, PodSpec } from './k8s-types.js';

describe('Kubernetes Domain Fidelity Test Suite (Kubernetes v1.31 Control Plane)', () => {
  describe('kube-scheduler Two-Stage Framework (Filter & Score)', () => {
    it('filters unviable nodes and scores remaining candidates by LeastAllocated priority', () => {
      const scheduler = new K8sScheduler();

      const worker1: K8sNode = {
        id: 'w1',
        name: 'worker-1',
        role: 'worker',
        status: 'Ready',
        capacity: { cpuMillis: 4000, memoryMb: 4096 },
        allocated: { cpuMillis: 3500, memoryMb: 3500 }, // Almost full: 12.5% free
        taints: [],
        podIds: [],
        color: '#fff',
      };

      const worker2: K8sNode = {
        id: 'w2',
        name: 'worker-2',
        role: 'worker',
        status: 'Ready',
        capacity: { cpuMillis: 4000, memoryMb: 4096 },
        allocated: { cpuMillis: 500, memoryMb: 512 }, // Mostly empty: ~87% free
        taints: [],
        podIds: [],
        color: '#fff',
      };

      const cordoned: K8sNode = {
        id: 'w3',
        name: 'worker-3',
        role: 'worker',
        status: 'SchedulingDisabled', // Filtered out
        capacity: { cpuMillis: 4000, memoryMb: 4096 },
        allocated: { cpuMillis: 0, memoryMb: 0 },
        taints: [],
        podIds: [],
        color: '#fff',
      };

      const pod: PodSpec = {
        id: 'pod-test',
        name: 'test-pod',
        namespace: 'default',
        deploymentId: null,
        replicaSetId: null,
        image: 'nginx:alpine',
        resources: { cpuMillis: 200, memoryMb: 256 },
        tolerations: [],
        nodeName: null,
        status: 'Pending',
        restarts: 0,
        createdAtTick: 1,
        pendingReason: null,
      };

      const decision = scheduler.schedule(pod, [worker1, worker2, cordoned]);
      // Must filter out cordoned node, and score worker2 higher than worker1
      expect(decision.selectedNode?.id).toBe('w2');
      expect(decision.failureReasons['w3']).toContain('SchedulingDisabled');
    });
  });

  describe('Pod Quality of Service (QoS) Eviction Hierarchy', () => {
    it('evicts BestEffort pods before Burstable and Guaranteed under memory pressure', () => {
      const rng = new DeterministicRNG(42);
      const cluster = createDefaultK8sCluster();

      // Place 3 pods with different QoS classes on worker node 1
      cluster.pods['pod-guaranteed'] = {
        id: 'pod-guaranteed',
        name: 'pod-guaranteed',
        namespace: 'default',
        deploymentId: null,
        replicaSetId: null,
        image: 'db:1.0',
        resources: { cpuMillis: 500, memoryMb: 512 },
        limits: { cpuMillis: 500, memoryMb: 512 },
        qosClass: 'Guaranteed',
        tolerations: [],
        nodeName: '1',
        status: 'Running',
        restarts: 0,
        createdAtTick: 1,
        pendingReason: null,
      };

      cluster.pods['pod-burstable'] = {
        id: 'pod-burstable',
        name: 'pod-burstable',
        namespace: 'default',
        deploymentId: null,
        replicaSetId: null,
        image: 'api:1.0',
        resources: { cpuMillis: 200, memoryMb: 256 },
        limits: { cpuMillis: 500, memoryMb: 512 },
        qosClass: 'Burstable',
        tolerations: [],
        nodeName: '1',
        status: 'Running',
        restarts: 0,
        createdAtTick: 1,
        pendingReason: null,
      };

      cluster.pods['pod-besteffort'] = {
        id: 'pod-besteffort',
        name: 'pod-besteffort',
        namespace: 'default',
        deploymentId: null,
        replicaSetId: null,
        image: 'batch:1.0',
        resources: { cpuMillis: 0, memoryMb: 0 },
        qosClass: 'BestEffort',
        tolerations: [],
        nodeName: '1',
        status: 'Running',
        restarts: 0,
        createdAtTick: 1,
        pendingReason: null,
      };

      cluster.nodes['1']!.podIds = ['pod-guaranteed', 'pod-burstable', 'pod-besteffort'];

      // Simulate memory pressure eviction on Node 1
      const pressureEv: K8sSimEvent = {
        id: 'press-1',
        tick: 10,
        type: 'K8S_EVICT_UNDER_PRESSURE',
        payload: { nodeId: '1' },
      };

      const res = pureK8sTransition(cluster, pressureEv, rng);
      // BestEffort pod must have been evicted first!
      expect(res.nextState.pods['pod-besteffort']!.status).toBe('Failed');
      expect(res.nextState.pods['pod-besteffort']!.pendingReason).toContain('memory pressure');
      // Guaranteed and Burstable pods remain Running
      expect(res.nextState.pods['pod-guaranteed']!.status).toBe('Running');
      expect(res.nextState.pods['pod-burstable']!.status).toBe('Running');
    });
  });

  describe('PodDisruptionBudget (PDB) Enforcement', () => {
    it('blocks node evictions when eviction would violate minAvailable threshold', () => {
      const rng = new DeterministicRNG(42);
      let cluster = createDefaultK8sCluster();

      // Configure PDB for api-service requiring minAvailable = 3
      const applyPdbEv: K8sSimEvent = {
        id: 'pdb-1',
        tick: 1,
        type: 'K8S_APPLY_PDB',
        payload: {
          pdb: {
            id: 'pdb-api',
            name: 'api-pdb',
            deploymentId: 'dep-api',
            minAvailable: 3,
          },
        },
      };
      cluster = pureK8sTransition(cluster, applyPdbEv, rng).nextState;

      // Ensure 3 pods are running for dep-api
      const runningPods = Object.values(cluster.pods).filter(
        (p) => p.deploymentId === 'dep-api' && p.status === 'Running',
      );
      expect(runningPods.length).toBe(3);

      // Find node hosting one of the running pods
      const targetNodeId = runningPods[0]!.nodeName!;

      // Try evicting under pressure on that node
      const evictEv: K8sSimEvent = {
        id: 'evict-pdb',
        tick: 2,
        type: 'K8S_EVICT_UNDER_PRESSURE',
        payload: { nodeId: targetNodeId },
      };

      const res = pureK8sTransition(cluster, evictEv, rng);
      // Should have been blocked by PDB!
      expect(res.nextState.totalPdbViolationsBlocked).toBe(1);
      // Pod remains running
      expect(res.nextState.pods[runningPods[0]!.id]!.status).toBe('Running');
    });
  });
});
