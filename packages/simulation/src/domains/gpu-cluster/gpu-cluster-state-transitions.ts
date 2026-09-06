/**
 * GPU Cluster Scheduling & Distributed Training State Transitions Reducer
 */

import type { DeterministicRNG } from '../../prng/deterministic-rng.js';
import type {
  GPUClusterState,
  GPUClusterSimEvent,
  GPUNode,
  InterconnectLink,
  MicrobatchStep,
  ModelWeightShard,
  OptimizerState,
  ZeROStage,
} from './gpu-cluster-types.js';

export function generateModelWeightShards(step: number, epoch: number, numShards = 8): ModelWeightShard[] {
  const shards: ModelWeightShard[] = [];
  const layersPerShard = 10; // 80 layers total
  for (let i = 0; i < numShards; i++) {
    const startLayer = i * layersPerShard;
    const endLayer = startLayer + layersPerShard - 1;
    const paramHash = (0x9e3779b9 ^ (step * 7919) ^ (i * 1013) ^ (epoch * 503)) >>> 0;
    const fp32Sum = Number((12345.678 + i * 42.1 + step * 0.5).toFixed(4));
    shards.push({
      shardId: `shard-${i}`,
      rank: i,
      layerRange: [startLayer, endLayer],
      parameterHash: paramHash,
      fp32MasterWeightSum: fp32Sum,
    });
  }
  return shards;
}

export function generateOptimizerState(step: number): OptimizerState {
  return {
    step,
    learningRate: 0.0001,
    beta1: 0.9,
    beta2: 0.999,
    weightDecay: 0.01,
  };
}

export function computeCheckpointChecksum(
  checkpointId: string,
  step: number,
  epoch: number,
  weightShards: ModelWeightShard[] = [],
  optimizerState?: OptimizerState,
): string {
  let hash = 0x811c9dc5;
  const updateString = (s: string) => {
    for (let i = 0; i < s.length; i++) {
      hash ^= s.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
  };
  const updateInt = (n: number) => {
    hash ^= (n >>> 0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  };

  updateString(`${checkpointId}:${step}:${epoch}:zero-3d-parallel`);
  for (const shard of weightShards) {
    updateString(`${shard.shardId}:${shard.rank}:${shard.layerRange[0]}-${shard.layerRange[1]}`);
    updateInt(shard.parameterHash);
    updateString(shard.fp32MasterWeightSum.toFixed(4));
  }
  if (optimizerState) {
    updateInt(optimizerState.step);
    updateString(optimizerState.learningRate.toString());
    updateString(optimizerState.beta1.toString());
    updateString(optimizerState.beta2.toString());
    updateString(optimizerState.weightDecay.toString());
  }

  return `0x${hash.toString(16).padStart(8, '0')}`;
}

function getZeROAllocatedMB(stage: ZeROStage): number {
  switch (stage) {
    case 'ZeRO-0':
      return 72000;
    case 'ZeRO-1':
      return 46000;
    case 'ZeRO-2':
      return 26000;
    case 'ZeRO-3':
      return 14000;
  }
}

export function createDefaultGPUCluster(clusterId = 'gpu-cluster-1'): GPUClusterState {
  const gpus: Record<string, GPUNode> = {};
  const interconnects: InterconnectLink[] = [];

  for (let i = 0; i < 8; i++) {
    const rackId = i < 4 ? 1 : 2;
    gpus[`gpu-${String(i)}`] = {
      id: `gpu-${String(i)}`,
      name: `NVIDIA H100 SXM5 #${String(i)}`,
      rackId,
      memoryTotalMB: 81920, // 80 GB
      memoryAllocatedMB: 26000, // ZeRO-2 default
      utilizationPct: 92,
      temperatureC: 62 + (i % 3) * 2,
      status: 'HEALTHY',
    };
  }

  // Intra-rack NVLink interconnects
  for (let r = 0; r < 2; r++) {
    const base = r * 4;
    for (let i = 0; i < 4; i++) {
      for (let j = i + 1; j < 4; j++) {
        interconnects.push({
          sourceGPU: `gpu-${String(base + i)}`,
          targetGPU: `gpu-${String(base + j)}`,
          type: 'NVLINK',
          bandwidthGBs: 900,
          saturated: false,
        });
      }
    }
  }

  // Inter-rack InfiniBand link
  interconnects.push({
    sourceGPU: 'gpu-3',
    targetGPU: 'gpu-4',
    type: 'INFINIBAND',
    bandwidthGBs: 50, // 400 Gbps
    saturated: false,
  });

  const pp = 2;
  const m = 8;
  const bubbleFraction = Number(((pp - 1) / (m + pp - 1)).toFixed(3)); // 1 / 9 = 0.111

  return {
    clusterId,
    tick: 0,
    gpus,
    interconnects,
    parallelismConfig: {
      tensorParallel: 2,
      pipelineParallel: 2,
      dataParallel: 2,
      totalGPUs: 8,
    },
    zeroStage: 'ZeRO-2',
    pipelineSchedule: {
      numStages: pp,
      microbatches: m,
      activeSteps: [],
      bubbleFraction,
      inFlightActivations: 0,
    },
    allReduceState: {
      step: 'IDLE',
      currentChunk: 0,
      totalChunks: 8,
      activeTransfers: [],
    },
    trainingJob: {
      jobId: 'train-llama-70b',
      currentStep: 150,
      totalSteps: 1000,
      status: 'TRAINING',
      lastCheckpoint: null,
    },
    metrics: {
      modelFlopsUtilizationPct: 54.2,
      stepTimeMs: 142.5,
      memorySavingsRatio: 3.15,
    },
  };
}

export function pureGPUClusterTransition(
  state: GPUClusterState,
  event: GPUClusterSimEvent,
  rng: DeterministicRNG,
): { nextState: GPUClusterState; emittedEvents: GPUClusterSimEvent[] } {
  const nextState: GPUClusterState = JSON.parse(
    JSON.stringify(state),
  ) as GPUClusterState;
  nextState.tick = event.tick;
  const emittedEvents: GPUClusterSimEvent[] = [];


  switch (event.type) {
    case 'TICK' as any:
    case 'GPU_TICK':
    case 'GPU_STEP_1F1B': {
      const { pipelineSchedule } = nextState;
      const stepIndex = nextState.tick % (pipelineSchedule.microbatches * 2 + pipelineSchedule.numStages);

      // Generate 1F1B microbatch timeline step
      const steps: MicrobatchStep[] = [];
      for (let s = 0; s < pipelineSchedule.numStages; s++) {
        let phase: 'F' | 'B' | 'BUBBLE' = 'BUBBLE';
        let mb = 0;

        if (stepIndex >= s && stepIndex < pipelineSchedule.microbatches + s) {
          phase = 'F';
          mb = stepIndex - s + 1;
        } else if (stepIndex >= pipelineSchedule.microbatches + s) {
          phase = 'B';
          mb = stepIndex - (pipelineSchedule.microbatches + s) + 1;
        }

        steps.push({
          stage: s,
          microbatch: mb,
          phase,
          tick: nextState.tick,
        });
      }

      pipelineSchedule.activeSteps = steps;
      // In-flight activation memory management
      const forwardCount = steps.filter((s) => s.phase === 'F').length;
      const backwardCount = steps.filter((s) => s.phase === 'B').length;
      pipelineSchedule.inFlightActivations = Math.max(
        0,
        Math.min(pipelineSchedule.numStages, pipelineSchedule.inFlightActivations + forwardCount - backwardCount),
      );

      // Minor temperature / utilization oscillation
      for (const gpu of Object.values(nextState.gpus)) {
        if (gpu.status === 'HEALTHY') {
          gpu.temperatureC = 60 + Math.floor(rng.nextFloat() * 6);
        }
      }
      break;
    }

    case 'GPU_STEP_ALLREDUCE': {
      const { allReduceState } = nextState;
      if (allReduceState.step === 'IDLE' || allReduceState.step === 'DONE') {
        allReduceState.step = 'SCATTER_REDUCE';
        allReduceState.currentChunk = 1;
      } else if (allReduceState.step === 'SCATTER_REDUCE') {
        allReduceState.currentChunk++;
        if (allReduceState.currentChunk >= allReduceState.totalChunks / 2) {
          allReduceState.step = 'ALLGATHER';
        }
      } else if (allReduceState.step === 'ALLGATHER') {
        allReduceState.currentChunk++;
        if (allReduceState.currentChunk >= allReduceState.totalChunks) {
          allReduceState.step = 'DONE';
          allReduceState.currentChunk = 0;
        }
      }
      break;
    }

    case 'GPU_SET_PARALLELISM': {
      const { tp, pp, dp } = event.payload;
      nextState.parallelismConfig.tensorParallel = tp;
      nextState.parallelismConfig.pipelineParallel = pp;
      nextState.parallelismConfig.dataParallel = dp;
      nextState.parallelismConfig.totalGPUs = tp * pp * dp;
      nextState.pipelineSchedule.numStages = pp;
      nextState.pipelineSchedule.bubbleFraction = Number(
        ((pp - 1) / (nextState.pipelineSchedule.microbatches + pp - 1)).toFixed(3),
      );
      break;
    }

    case 'GPU_SET_ZERO_STAGE': {
      nextState.zeroStage = event.payload.stage;
      const allocMB = getZeROAllocatedMB(event.payload.stage);
      for (const gpu of Object.values(nextState.gpus)) {
        gpu.memoryAllocatedMB = allocMB;
      }
      nextState.metrics.memorySavingsRatio = Number(
        (81920 / Math.max(1, allocMB)).toFixed(2),
      );
      break;
    }

    case 'GPU_THROTTLE_STRAGGLER': {
      const { gpuId, throttled } = event.payload;
      const gpu = nextState.gpus[gpuId];
      if (gpu) {
        gpu.status = throttled ? 'THROTTLED' : 'HEALTHY';
        gpu.utilizationPct = throttled ? 45 : 92;
        gpu.temperatureC = throttled ? 84 : 64; // Thermal throttle
      }
      nextState.metrics.stepTimeMs = throttled ? 285.0 : 142.5; // Drag factor
      break;
    }

    case 'GPU_SEVER_NVLINK': {
      const { sourceGPU, targetGPU } = event.payload;
      const link = nextState.interconnects.find(
        (l) =>
          (l.sourceGPU === sourceGPU && l.targetGPU === targetGPU) ||
          (l.sourceGPU === targetGPU && l.targetGPU === sourceGPU),
      );
      if (link) {
        link.type = 'PCIE';
        link.bandwidthGBs = 64; // Collapsed from 900 GB/s NVLink to PCIe Gen5
        link.saturated = true;
      }
      break;
    }

    case 'GPU_SPOT_PREEMPTION': {
      if (!nextState.trainingJob) {
        nextState.trainingJob = {
          jobId: 'train-llama-70b',
          currentStep: 150,
          totalSteps: 1000,
          status: 'TRAINING',
          lastCheckpoint: null,
        };
      }
      nextState.trainingJob.status = 'PREEMPTED';
      if (event.payload?.saveCheckpoint !== false) {
        const step = nextState.trainingJob.currentStep;
        const epoch = Math.floor(step / 100);
        const checkpointId = `ckpt-${nextState.tick}-${step}`;
        const weightShards = generateModelWeightShards(step, epoch);
        const optimizerState = generateOptimizerState(step);
        const checksum = computeCheckpointChecksum(
          checkpointId,
          step,
          epoch,
          weightShards,
          optimizerState,
        );
        nextState.trainingJob.lastCheckpoint = {
          checkpointId,
          step,
          epoch,
          modelFlopsUtilizationPct: nextState.metrics.modelFlopsUtilizationPct,
          weightShards,
          optimizerState,
          checksum,
          corrupted: false,
        };
      }
      break;
    }

    case 'GPU_CORRUPT_CHECKPOINT': {
      if (nextState.trainingJob?.lastCheckpoint) {
        const firstShard = nextState.trainingJob.lastCheckpoint.weightShards?.[0];
        if (firstShard) {
          firstShard.parameterHash ^= 0xdeadbeef;
        }
        nextState.trainingJob.lastCheckpoint.corrupted = true;
        nextState.trainingJob.lastCheckpoint.checksum = '0xDEADBEEF_CORRUPTED';
      }
      break;
    }

    case 'GPU_RESUME_TRAINING': {
      if (!nextState.trainingJob) {
        nextState.trainingJob = {
          jobId: 'train-llama-70b',
          currentStep: 0,
          totalSteps: 1000,
          status: 'TRAINING',
          lastCheckpoint: null,
        };
      }
      const job = nextState.trainingJob;
      const ckpt = job.lastCheckpoint;
      let isValid = false;
      let failureReason = '';

      if (!ckpt) {
        failureReason = 'No checkpoint found; initiating fresh training';
      } else if (ckpt.corrupted || event.payload?.forceCorruptedCheckpoint) {
        failureReason = 'Explicit checkpoint corruption detected';
      } else {
        const expectedChecksum = computeCheckpointChecksum(
          ckpt.checkpointId,
          ckpt.step,
          ckpt.epoch,
          ckpt.weightShards,
          ckpt.optimizerState,
        );
        if (ckpt.checksum !== expectedChecksum) {
          failureReason = `Checksum mismatch: expected ${expectedChecksum}, got ${ckpt.checksum}`;
        } else {
          isValid = true;
        }
      }

      if (isValid && ckpt) {
        job.status = 'TRAINING';
        job.currentStep = ckpt.step;
        emittedEvents.push({
          id: `resume-${nextState.tick}`,
          tick: nextState.tick,
          type: 'GPU_RESUME_FROM_CHECKPOINT',
          payload: {
            checkpointId: ckpt.checkpointId,
            resumedAtStep: ckpt.step,
          },
        });
      } else {
        // Detected corruption or missing: enforce restart from scratch (step 0)
        job.status = 'TRAINING';
        job.currentStep = 0;
        job.lastCheckpoint = null;
        emittedEvents.push({
          id: `restart-${nextState.tick}`,
          tick: nextState.tick,
          type: 'GPU_CHECKPOINT_CORRUPT_RESTART',
          payload: {
            reason: failureReason,
            restartedAtStep: 0,
          },
        });
      }
      break;
    }
  }

  (nextState as any).rngState = rng.getState();
  return { nextState, emittedEvents };
}

