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

  it('GPU-5a: validates unmodified stateful checkpoint checksum and resumes training normally', () => {
    let state = createDefaultGPUCluster();

    // 1. Initial training state at step 150
    expect((state as any).trainingJob.currentStep).toBe(150);

    // 2. Trigger spot preemption which writes a stateful checkpoint
    const preemptResult = pureGPUClusterTransition(
      state,
      { id: 'preempt-1', tick: 10, type: 'GPU_SPOT_PREEMPTION' as any },
      rng,
    );
    state = preemptResult.nextState;
    expect((state as any).trainingJob.status).toBe('PREEMPTED');
    const ckpt = (state as any).trainingJob.lastCheckpoint;
    expect(ckpt).toBeDefined();
    expect(ckpt.step).toBe(150);
    expect(ckpt.weightShards).toBeDefined();
    expect(ckpt.weightShards.length).toBe(8);
    expect(ckpt.optimizerState).toBeDefined();
    expect(ckpt.checksum).toMatch(/^0x[0-9a-f]{8}$/);

    // 3. Positive resume with unmodified checkpoint
    const resumeResult = pureGPUClusterTransition(
      JSON.parse(JSON.stringify(state)),
      { id: 'resume-positive', tick: 12, type: 'GPU_RESUME_TRAINING' as any },
      rng,
    );
    const resumeState = resumeResult.nextState as any;
    expect(resumeState.trainingJob.status).toBe('TRAINING');
    expect(resumeState.trainingJob.currentStep).toBe(150); // Successfully resumed at step 150
    expect(
      resumeResult.emittedEvents.some((e: any) => e.type === 'GPU_RESUME_FROM_CHECKPOINT'),
    ).toBe(true);
  });

  it('GPU-5b: organically detects weight shard corruption via checksum mismatch and restarts from scratch', () => {
    let state = createDefaultGPUCluster();

    // 1. Trigger spot preemption to create valid stateful checkpoint
    state = pureGPUClusterTransition(
      state,
      { id: 'preempt-1', tick: 10, type: 'GPU_SPOT_PREEMPTION' as any },
      rng,
    ).nextState;

    const originalCkpt = (state as any).trainingJob.lastCheckpoint;
    expect(originalCkpt).toBeDefined();
    expect(originalCkpt.weightShards.length).toBeGreaterThan(0);

    // 2. Corrupt checkpoint state data directly (flip bits in weight shard parameter hash)
    // without setting corrupted = true or modifying ckpt.checksum
    const corruptState: any = JSON.parse(JSON.stringify(state));
    corruptState.trainingJob.lastCheckpoint.weightShards[0].parameterHash ^= 0x1337;
    expect(corruptState.trainingJob.lastCheckpoint.corrupted).toBeFalsy();

    // 3. Attempt resume with organically corrupted checkpoint state
    const corruptResumeResult = pureGPUClusterTransition(
      corruptState,
      { id: 'resume-corrupt', tick: 15, type: 'GPU_RESUME_TRAINING' as any },
      rng,
    );

    // 4. Must organically detect checksum mismatch and restart from scratch (step 0)
    const corruptResumeState: any = corruptResumeResult.nextState;
    expect(corruptResumeState.trainingJob.status).toBe('TRAINING');
    expect(corruptResumeState.trainingJob.currentStep).toBe(0); // Restart from scratch!

    const restartEvent = corruptResumeResult.emittedEvents.find(
      (e) => e.type === 'GPU_CHECKPOINT_CORRUPT_RESTART',
    );
    expect(restartEvent).toBeDefined();
    if (restartEvent && restartEvent.type === 'GPU_CHECKPOINT_CORRUPT_RESTART') {
      expect(restartEvent.payload.restartedAtStep).toBe(0);
      expect(restartEvent.payload.reason).toContain('Checksum mismatch');
    }
  });
});


