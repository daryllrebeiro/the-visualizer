import type { DeterministicRNG } from '../../prng/deterministic-rng.js';
import { reconcileCluster } from './k8s-reconciliation.js';
import type { DeploymentSpec, K8sClusterState, K8sNode, K8sSimEvent } from './k8s-types.js';

export interface K8sTransitionResult {
  nextState: K8sClusterState;
  emittedEvents: K8sSimEvent[];
}

export function createDefaultK8sCluster(clusterId = 'k8s-cluster-1'): K8sClusterState {
  const nodes: Record<string, K8sNode> = {
    '1': {
      id: '1',
      name: 'worker-node-1',
      role: 'worker',
      status: 'Ready',
      capacity: { cpuMillis: 2000, memoryMb: 2048 },
      allocated: { cpuMillis: 0, memoryMb: 0 },
      taints: [],
      podIds: [],
      color: '#38bdf8',
    },
    '2': {
      id: '2',
      name: 'worker-node-2',
      role: 'worker',
      status: 'Ready',
      capacity: { cpuMillis: 2000, memoryMb: 2048 },
      allocated: { cpuMillis: 0, memoryMb: 0 },
      taints: [],
      podIds: [],
      color: '#34d399',
    },
    '3': {
      id: '3',
      name: 'worker-node-3',
      role: 'worker',
      status: 'Ready',
      capacity: { cpuMillis: 2000, memoryMb: 2048 },
      allocated: { cpuMillis: 0, memoryMb: 0 },
      taints: [],
      podIds: [],
      color: '#fbbf24',
    },
  };

  const defaultDep: DeploymentSpec = {
    id: 'dep-api',
    name: 'api-service',
    namespace: 'default',
    replicas: 3,
    strategy: 'RollingUpdate',
    maxSurge: 1,
    maxUnavailable: 0,
    image: 'api:v1.0.0',
    resources: { cpuMillis: 500, memoryMb: 512 },
    tolerations: [],
    currentRevision: 1,
  };

  const state: K8sClusterState = {
    clusterId,
    tick: 0,
    rngState: 42,
    fidelityMode: 'TEXTBOOK',
    nodes,
    deployments: { [defaultDep.id]: defaultDep },
    replicaSets: {},
    pods: {},
    podDisruptionBudgets: {},
    totalReconciliations: 0,
    totalPodsScheduled: 0,
    totalPodsEvicted: 0,
    totalPdbViolationsBlocked: 0,
  };

  // Run initial reconciliation
  reconcileCluster(state);

  return state;
}

export function pureK8sTransition(
  state: K8sClusterState,
  event: K8sSimEvent,
  rng: DeterministicRNG,
): K8sTransitionResult {
  const nextState: K8sClusterState = JSON.parse(JSON.stringify(state)) as K8sClusterState;
  const emittedEvents: K8sSimEvent[] = [];

  nextState.tick = event.tick;

  switch (event.type) {
    case 'K8S_APPLY_DEPLOYMENT': {
      const dep = event.payload['deployment'] as DeploymentSpec;
      nextState.deployments[dep.id] = dep;
      reconcileCluster(nextState);
      break;
    }
    case 'K8S_SCALE_DEPLOYMENT': {
      const depId = String(event.payload['deploymentId'] ?? '');
      const replicas = Number(event.payload['replicas'] ?? 3);
      if (nextState.deployments[depId]) {
        nextState.deployments[depId].replicas = Math.max(0, replicas);
      }
      reconcileCluster(nextState);
      break;
    }
    case 'K8S_UPDATE_IMAGE': {
      const depId = String(event.payload['deploymentId'] ?? '');
      const newImage = String(event.payload['newImage'] ?? '');
      if (nextState.deployments[depId]) {
        nextState.deployments[depId].image = newImage;
        nextState.deployments[depId].currentRevision++;
      }
      reconcileCluster(nextState);
      break;
    }
    case 'K8S_NODE_CORDON': {
      const nodeId = String(event.payload['nodeId'] ?? '');
      const node = nextState.nodes[nodeId];
      if (node) {
        node.status = node.status === 'SchedulingDisabled' ? 'Ready' : 'SchedulingDisabled';
      }
      reconcileCluster(nextState);
      break;
    }
    case 'K8S_NODE_DRAIN': {
      const nodeId = String(event.payload['nodeId'] ?? '');
      const node = nextState.nodes[nodeId];
      if (node) {
        node.status = 'SchedulingDisabled';
        for (const podId of node.podIds) {
          const pod = nextState.pods[podId];
          if (pod) {
            pod.status = 'Pending';
            pod.nodeName = null;
            nextState.totalPodsEvicted++;
          }
        }
        node.podIds = [];
        node.allocated = { cpuMillis: 0, memoryMb: 0 };
      }
      reconcileCluster(nextState);
      break;
    }
    case 'K8S_NODE_CRASH': {
      const nodeId = String(event.payload['nodeId'] ?? '');
      const node = nextState.nodes[nodeId];
      if (node) {
        node.status = 'NotReady';
      }
      reconcileCluster(nextState);
      break;
    }
    case 'K8S_NODE_RECOVER': {
      const nodeId = String(event.payload['nodeId'] ?? '');
      const node = nextState.nodes[nodeId];
      if (node) {
        node.status = 'Ready';
      }
      reconcileCluster(nextState);
      break;
    }
    case 'K8S_RECONCILE_TICK': {
      reconcileCluster(nextState);
      break;
    }
    case 'K8S_APPLY_PDB': {
      const pdb = event.payload['pdb'] as any;
      if (pdb?.id) {
        nextState.podDisruptionBudgets[pdb.id] = pdb;
      }
      break;
    }
    case 'K8S_EVICT_UNDER_PRESSURE': {
      const targetId = String(event.payload['nodeId'] ?? '');
      const node =
        nextState.nodes[targetId] ??
        Object.values(nextState.nodes).find((n) => n.name === targetId);
      if (node) {
        // Collect pods on node and sort by QoS priority (BestEffort -> Burstable -> Guaranteed)
        const nodePods = node.podIds
          .map((id) => nextState.pods[id])
          .filter(
            (p): p is (typeof nextState.pods)[string] => p !== undefined && p.status === 'Running',
          );

        const qosOrder: Record<string, number> = {
          BestEffort: 0,
          Burstable: 1,
          Guaranteed: 2,
        };

        nodePods.sort((a, b) => {
          const qosA = a.qosClass ?? 'Burstable';
          const qosB = b.qosClass ?? 'Burstable';
          return (qosOrder[qosA] ?? 1) - (qosOrder[qosB] ?? 1);
        });

        for (const victim of nodePods) {
          // Check PDB
          let canEvict = true;
          if (victim.deploymentId) {
            const pdb = Object.values(nextState.podDisruptionBudgets).find(
              (b) => b.deploymentId === victim.deploymentId,
            );
            if (pdb) {
              const activeCount = Object.values(nextState.pods).filter(
                (p) => p.deploymentId === victim.deploymentId && p.status === 'Running',
              ).length;
              if (activeCount <= pdb.minAvailable) {
                canEvict = false;
                nextState.totalPdbViolationsBlocked++;
              }
            }
          }

          if (canEvict) {
            victim.status = 'Failed';
            victim.pendingReason = 'Evicted under memory pressure';
            node.podIds = node.podIds.filter((id) => id !== victim.id);
            node.allocated.cpuMillis = Math.max(
              0,
              node.allocated.cpuMillis - victim.resources.cpuMillis,
            );
            node.allocated.memoryMb = Math.max(
              0,
              node.allocated.memoryMb - victim.resources.memoryMb,
            );
            nextState.totalPodsEvicted++;
            emittedEvents.push({
              id: `evict-${victim.id}-${String(nextState.tick)}`,
              tick: nextState.tick,
              type: 'K8S_POD_TERMINATED',
              payload: { podId: victim.id, qosClass: victim.qosClass, reason: 'PressureEviction' },
            });
            break; // Evicted one candidate for this pressure tick
          }
        }
      }
      break;
    }
    case 'K8S_CONFIGURE_FIDELITY': {
      if (event.payload['fidelityMode'] !== undefined) {
        nextState.fidelityMode = event.payload['fidelityMode'] as 'TEXTBOOK' | 'REALISTIC';
      }
      break;
    }
  }

  nextState.rngState = rng.getState();
  return { nextState, emittedEvents };
}
