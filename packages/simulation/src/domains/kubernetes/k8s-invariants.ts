import type { K8sClusterState, K8sNode, PodSpec } from './k8s-types.js';

export interface K8sInvariantViolation {
  ruleId: string;
  invariantName: string;
  description: string;
  affectedNodeIds: string[];
}

export class K8sInvariantChecker {
  public check(state: K8sClusterState): K8sInvariantViolation | undefined {
    const nodes = Object.values(state.nodes) as K8sNode[];
    const pods = Object.values(state.pods) as PodSpec[];

    // 1. Check Node Resource Limits
    for (const node of nodes) {
      if (node.allocated.cpuMillis > node.capacity.cpuMillis) {
        return {
          ruleId: 'K8S_CPU_OVERCOMMIT',
          invariantName: 'Node CPU Capacity',
          description: `Node ${node.name} allocated CPU (${String(node.allocated.cpuMillis)}m) exceeds capacity (${String(node.capacity.cpuMillis)}m)`,
          affectedNodeIds: [node.id],
        };
      }
      if (node.allocated.memoryMb > node.capacity.memoryMb) {
        return {
          ruleId: 'K8S_MEMORY_OVERCOMMIT',
          invariantName: 'Node Memory Capacity',
          description: `Node ${node.name} allocated Memory (${String(node.allocated.memoryMb)}Mi) exceeds capacity (${String(node.capacity.memoryMb)}Mi)`,
          affectedNodeIds: [node.id],
        };
      }
    }

    // 2. Check Taints & Tolerations on running pods
    for (const pod of pods) {
      if (pod.status === 'Running' && pod.nodeName) {
        const node = nodes.find((n) => n.name === pod.nodeName);
        if (node) {
          for (const taint of node.taints) {
            if (taint.effect === 'NoSchedule') {
              const hasTol = pod.tolerations.some(
                (tol) => tol.key === taint.key && tol.value === taint.value,
              );
              if (!hasTol) {
                return {
                  ruleId: 'K8S_TAINT_VIOLATION',
                  invariantName: 'Taint Non-Violability',
                  description: `Pod ${pod.name} scheduled on node ${node.name} with untolerated taint {${taint.key}: ${taint.value}}`,
                  affectedNodeIds: [node.id],
                };
              }
            }
          }
        }
      }
    }

    return undefined;
  }
}
