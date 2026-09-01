import type { K8sNode, PodSpec } from './k8s-types.js';

export interface SchedulingDecision {
  selectedNode: K8sNode | null;
  failureReasons: Record<string, string>; // nodeId -> reason
  diagnosticSummary: string | null;
}

export class K8sScheduler {
  /**
   * Two-Phase Scheduling: Filtering (Predicates) + Scoring (Priorities)
   */
  public schedule(pod: PodSpec, nodes: K8sNode[]): SchedulingDecision {
    const failureReasons: Record<string, string> = {};
    const candidateNodes: K8sNode[] = [];

    // Phase 1: Filter (Predicates)
    for (const node of nodes) {
      const nodeReasons: string[] = [];

      if (node.role === 'control-plane') {
        nodeReasons.push('Control-plane node (NoSchedule)');
      }

      if (node.status === 'NotReady') {
        nodeReasons.push('Node NotReady');
      }

      if (node.status === 'SchedulingDisabled') {
        nodeReasons.push('Node SchedulingDisabled (Cordoned)');
      }

      // Check CPU
      if (node.allocated.cpuMillis + pod.resources.cpuMillis > node.capacity.cpuMillis) {
        nodeReasons.push(
          `Insufficient CPU (requires ${String(pod.resources.cpuMillis)}m, available ${String(node.capacity.cpuMillis - node.allocated.cpuMillis)}m)`,
        );
      }

      // Check Memory
      if (node.allocated.memoryMb + pod.resources.memoryMb > node.capacity.memoryMb) {
        nodeReasons.push(
          `Insufficient Memory (requires ${String(pod.resources.memoryMb)}Mi, available ${String(node.capacity.memoryMb - node.allocated.memoryMb)}Mi)`,
        );
      }

      // Check Taints & Tolerations
      for (const taint of node.taints) {
        if (taint.effect === 'NoSchedule') {
          const hasToleration = pod.tolerations.some(
            (tol) => tol.key === taint.key && tol.value === taint.value,
          );
          if (!hasToleration) {
            nodeReasons.push(`Untolerated taint {${taint.key}: ${taint.value}}`);
            break;
          }
        }
      }

      if (nodeReasons.length > 0) {
        failureReasons[node.id] = nodeReasons.join(', ');
      } else {
        candidateNodes.push(node);
      }
    }

    // If no nodes pass filter
    if (candidateNodes.length === 0) {
      const reasonSummary = Object.entries(failureReasons)
        .map(([nId, r]) => `Node #${nId}: ${r}`)
        .join('; ');
      return {
        selectedNode: null,
        failureReasons,
        diagnosticSummary: `0/${String(nodes.length)} nodes available: ${reasonSummary}`,
      };
    }

    // Phase 2: Score (Priorities - LeastAllocated)
    let bestNode = candidateNodes[0]!;
    let bestScore = -1;

    for (const node of candidateNodes) {
      const cpuFreeFraction = (node.capacity.cpuMillis - node.allocated.cpuMillis) / node.capacity.cpuMillis;
      const memFreeFraction = (node.capacity.memoryMb - node.allocated.memoryMb) / node.capacity.memoryMb;
      const score = cpuFreeFraction * 50 + memFreeFraction * 50;

      if (score > bestScore) {
        bestScore = score;
        bestNode = node;
      }
    }

    return {
      selectedNode: bestNode,
      failureReasons,
      diagnosticSummary: null,
    };
  }
}
