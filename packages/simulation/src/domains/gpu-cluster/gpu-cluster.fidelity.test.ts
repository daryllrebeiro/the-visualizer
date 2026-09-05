import { describe, expect, it } from 'vitest';

import { DeterministicRNG } from '../../prng/deterministic-rng.js';
import { GPUClusterInvariantChecker } from './gpu-cluster-invariants.js';
import {
  createDefaultGPUCluster,
  pureGPUClusterTransition,
} from './gpu-cluster-state-transitions.js';
import type { GPUClusterState } from './gpu-cluster-types.js';

describe('Domain 13: GPU Cluster & 3D Parallelism Fidelity', () => {
  const rng = new DeterministicRNG(404);
  const checker = new GPUClusterInvariantChecker();

  it('GPU-1: enforces 3D parallelism product consistency and active GPU capacity', () => {
    let state = createDefaultGPUCluster();
    expect(checker.check(state)).toBeNull();

    // 2 * 2 * 2 = 8 GPUs
    expect(state.parallelismConfig.totalGPUs).toBe(8);

    // Inconsistent TP/PP/DP configuration
    const inconsistentState: GPUClusterState = JSON.parse(
      JSON.stringify(state),
    ) as GPUClusterState;
    inconsistentState.parallelismConfig.tensorParallel = 4; // 4 * 2 * 2 = 16 != 8
    let violation = checker.check(inconsistentState);
    expect(violation).not.toBeNull();
    expect(violation?.ruleId).toBe('GPU-1');

    // Offline nodes exceeding capacity
    const offlineState: GPUClusterState = JSON.parse(JSON.stringify(state)) as GPUClusterState;
    offlineState.gpus['gpu-0']!.status = 'OFFLINE';
    violation = checker.check(offlineState);
    expect(violation).not.toBeNull();
    expect(violation?.ruleId).toBe('GPU-1');
  });

  it('GPU-2: enforces pipeline bubble conservation and bounded memory activations', () => {
    let state = createDefaultGPUCluster();

    // Step 1F1B forward
    for (let t = 1; t <= 12; t++) {
      state = pureGPUClusterTransition(
        state,
        { id: `step-${String(t)}`, tick: t, type: 'GPU_STEP_1F1B' },
        rng,
      ).nextState;
      expect(checker.check(state)).toBeNull();
      expect(state.pipelineSchedule.inFlightActivations).toBeGreaterThanOrEqual(0);
      expect(state.pipelineSchedule.inFlightActivations).toBeLessThanOrEqual(
        state.pipelineSchedule.numStages * 2,
      );
    }

    // Negative activation underflow
    const underflowState: GPUClusterState = JSON.parse(
      JSON.stringify(state),
    ) as GPUClusterState;
    underflowState.pipelineSchedule.inFlightActivations = -1;
    const violation = checker.check(underflowState);
    expect(violation).not.toBeNull();
    expect(violation?.ruleId).toBe('GPU-2');
  });

  it('GPU-3: validates ZeRO stage memory scaling without VRAM OOM', () => {
    let state = createDefaultGPUCluster();

    // ZeRO-3: 14 GB allocated
    state = pureGPUClusterTransition(
      state,
      { id: 'zero-3', tick: 1, type: 'GPU_SET_ZERO_STAGE', payload: { stage: 'ZeRO-3' } },
      rng,
    ).nextState;
    expect(state.gpus['gpu-0']?.memoryAllocatedMB).toBe(14000);
    expect(state.metrics.memorySavingsRatio).toBeGreaterThan(5.0);
    expect(checker.check(state)).toBeNull();

    // OOM breach
    const oomState: GPUClusterState = JSON.parse(JSON.stringify(state)) as GPUClusterState;
    oomState.gpus['gpu-0']!.memoryAllocatedMB = 95000; // Exceeds 81920 MB
    const violation = checker.check(oomState);
    expect(violation).not.toBeNull();
    expect(violation?.ruleId).toBe('GPU-3');
  });

  it('advances Ring-AllReduce gradient synchronization steps and handles straggler drag', () => {
    let state = createDefaultGPUCluster();

    // Step AllReduce from IDLE -> SCATTER_REDUCE -> ALLGATHER -> DONE
    state = pureGPUClusterTransition(
      state,
      { id: 'ar-1', tick: 1, type: 'GPU_STEP_ALLREDUCE' },
      rng,
    ).nextState;
    expect(state.allReduceState.step).toBe('SCATTER_REDUCE');

    // Throttle GPU straggler
    state = pureGPUClusterTransition(
      state,
      {
        id: 'straggler-1',
        tick: 2,
        type: 'GPU_THROTTLE_STRAGGLER',
        payload: { gpuId: 'gpu-2', throttled: true },
      },
      rng,
    ).nextState;
    expect(state.gpus['gpu-2']?.status).toBe('THROTTLED');
    expect(state.metrics.stepTimeMs).toBe(285.0); // Step time doubled
  });
});
