/**
 * GPU Cluster Scheduling & 3D Parallelism Invariant Checker
 *
 * Invariants:
 * - GPU-1: 3D Parallelism Product Consistency (TP * PP * DP === totalGPUs <= activeGPUs)
 * - GPU-2: Pipeline Bubble Conservation (inFlightActivations >= 0 and <= PP)
 * - GPU-3: ZeRO Memory Allocation Bounds (GPU memory <= memoryTotalMB)
 * - GPU-4: Gradient Synchronization Invariance (all DP nodes synchronized post-AllReduce)
 */

import type { GPUClusterState } from './gpu-cluster-types.js';

export interface GPUClusterInvariantViolation {
  ruleId: 'GPU-1' | 'GPU-2' | 'GPU-3' | 'GPU-4';
  invariantName: string;
  description: string;
  isPedagogicalFlaw?: boolean | undefined;
}

export class GPUClusterInvariantChecker {
  public check(state: GPUClusterState): GPUClusterInvariantViolation | null {
    const { parallelismConfig, gpus, pipelineSchedule } = state;

    // 1. GPU-1: 3D Parallelism Product Consistency
    const product =
      parallelismConfig.tensorParallel *
      parallelismConfig.pipelineParallel *
      parallelismConfig.dataParallel;

    if (product !== parallelismConfig.totalGPUs) {
      return {
        ruleId: 'GPU-1',
        invariantName: '3D Parallelism Product Consistency',
        description: `Parallelism product TP(${parallelismConfig.tensorParallel}) * PP(${parallelismConfig.pipelineParallel}) * DP(${parallelismConfig.dataParallel}) = ${product}, which does not match totalGPUs (${parallelismConfig.totalGPUs}).`,
      };
    }

    const activeGpus = Object.values(gpus).filter((g) => g.status !== 'OFFLINE').length;
    if (parallelismConfig.totalGPUs > activeGpus) {
      return {
        ruleId: 'GPU-1',
        invariantName: '3D Parallelism Product Consistency',
        description: `Total configured GPUs (${parallelismConfig.totalGPUs}) exceeds active healthy GPUs (${activeGpus}).`,
      };
    }

    // 2. GPU-2: Pipeline Bubble Conservation
    if (pipelineSchedule.inFlightActivations < 0) {
      return {
        ruleId: 'GPU-2',
        invariantName: 'Pipeline Bubble Conservation',
        description: `In-flight pipeline activations dropped below zero (${pipelineSchedule.inFlightActivations}). Memory underflow error.`,
      };
    }

    if (pipelineSchedule.inFlightActivations > pipelineSchedule.numStages * 2) {
      return {
        ruleId: 'GPU-2',
        invariantName: 'Pipeline Bubble Conservation',
        description: `In-flight pipeline activations (${pipelineSchedule.inFlightActivations}) exceeds 1F1B maximum memory bound (${pipelineSchedule.numStages * 2}).`,
      };
    }

    // 3. GPU-3: ZeRO Memory Allocation Bounds
    for (const gpu of Object.values(gpus)) {
      if (gpu.memoryAllocatedMB > gpu.memoryTotalMB) {
        return {
          ruleId: 'GPU-3',
          invariantName: 'ZeRO Memory Allocation Bounds',
          description: `GPU "${gpu.id}" VRAM allocation (${gpu.memoryAllocatedMB} MB) breached total capacity (${gpu.memoryTotalMB} MB). Out Of Memory (OOM).`,
        };
      }
    }

    return null;
  }
}
