import { K8sScheduler } from './k8s-scheduler.js';
import type {
  K8sClusterState,
  K8sNode,
  PodSpec,
  ReplicaSetSpec,
} from './k8s-types.js';

export function reconcileCluster(state: K8sClusterState): void {
  state.totalReconciliations++;
  const scheduler = new K8sScheduler();
  const nodes = Object.values(state.nodes) as K8sNode[];

  // 1. Deployment Controller: Reconcile Deployments -> ReplicaSets
  for (const dep of Object.values(state.deployments)) {
    const activeRSId = `rs-${dep.id}-rev${String(dep.currentRevision)}`;

    // Ensure active ReplicaSet exists
    if (!state.replicaSets[activeRSId]) {
      state.replicaSets[activeRSId] = {
        id: activeRSId,
        name: `${dep.name}-rs-${String(dep.currentRevision)}`,
        deploymentId: dep.id,
        revision: dep.currentRevision,
        replicas: dep.replicas,
        image: dep.image,
        resources: dep.resources,
      };
    }

    // Handle Rolling Updates if older ReplicaSets exist
    const depReplicaSets = (Object.values(state.replicaSets) as ReplicaSetSpec[]).filter(
      (rs) => rs.deploymentId === dep.id,
    );

    const oldRSs = depReplicaSets.filter((rs) => rs.revision < dep.currentRevision);
    if (oldRSs.length > 0) {
      // Rolling update progression: scale down old RSs, scale up new RS
      const newRS = state.replicaSets[activeRSId]!;
      newRS.replicas = dep.replicas;

      for (const oldRS of oldRSs) {
        if (oldRS.replicas > 0) {
          oldRS.replicas = Math.max(0, oldRS.replicas - 1);
        }
      }
    }
  }

  // 2. ReplicaSet Controller: Reconcile ReplicaSets -> Pods
  for (const rs of Object.values(state.replicaSets)) {
    const existingPods = (Object.values(state.pods) as PodSpec[]).filter(
      (p) => p.replicaSetId === rs.id && p.status !== 'Terminating' && p.status !== 'Failed',
    );

    const diff = rs.replicas - existingPods.length;

    if (diff > 0) {
      // Scale UP: Create Pending Pods
      for (let i = 0; i < diff; i++) {
        const podId = `pod-${rs.id}-${String(state.tick)}-${String(i + 1)}`;
        state.pods[podId] = {
          id: podId,
          name: `${rs.name}-${String(Math.random().toString(36).substring(2, 6))}`,
          namespace: 'default',
          deploymentId: rs.deploymentId,
          replicaSetId: rs.id,
          image: rs.image,
          resources: rs.resources,
          tolerations: [],
          nodeName: null,
          status: 'Pending',
          restarts: 0,
          createdAtTick: state.tick,
          pendingReason: null,
        };
      }
    } else if (diff < 0) {
      // Scale DOWN: Terminate excess pods
      const podsToTerminate = existingPods.slice(0, Math.abs(diff));
      for (const pod of podsToTerminate) {
        pod.status = 'Terminating';
        if (pod.nodeName) {
          const node = nodes.find((n) => n.name === pod.nodeName);
          if (node) {
            node.allocated.cpuMillis = Math.max(0, node.allocated.cpuMillis - pod.resources.cpuMillis);
            node.allocated.memoryMb = Math.max(0, node.allocated.memoryMb - pod.resources.memoryMb);
            node.podIds = node.podIds.filter((id) => id !== pod.id);
          }
        }
        delete state.pods[pod.id];
      }
    }
  }

  // 3. Scheduler Loop: Schedule Pending Pods onto available Nodes
  const pendingPods = (Object.values(state.pods) as PodSpec[]).filter((p) => p.status === 'Pending');

  for (const pod of pendingPods) {
    const decision = scheduler.schedule(pod, nodes);

    if (decision.selectedNode) {
      const node = decision.selectedNode;
      pod.status = 'Running';
      pod.nodeName = node.name;
      pod.pendingReason = null;

      node.allocated.cpuMillis += pod.resources.cpuMillis;
      node.allocated.memoryMb += pod.resources.memoryMb;
      node.podIds.push(pod.id);
      state.totalPodsScheduled++;
    } else {
      pod.pendingReason = decision.diagnosticSummary;
    }
  }

  // 4. Node Lifecycle: Evict pods on NotReady nodes
  for (const node of nodes) {
    if (node.status === 'NotReady' && node.podIds.length > 0) {
      for (const podId of node.podIds) {
        const pod = state.pods[podId];
        if (pod) {
          pod.status = 'Pending';
          pod.nodeName = null;
          pod.pendingReason = `Node ${node.name} is NotReady`;
          state.totalPodsEvicted++;
        }
      }
      node.podIds = [];
      node.allocated = { cpuMillis: 0, memoryMb: 0 };
    }
  }
}
