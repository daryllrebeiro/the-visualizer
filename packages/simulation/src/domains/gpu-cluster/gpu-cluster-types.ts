/**
 * GPU Cluster Scheduling & Distributed Training (3D Parallelism) Types
 *
 * References:
 * - Shoeybi et al. (2019): Megatron-LM: Training Multi-Billion Parameter Language Models Using Model Parallelism
 * - Rajbhandari et al. (2020): ZeRO: Memory Optimizations Toward Training Trillion Parameter Models (SC '20)
 * - Narayanan et al. (2021): Efficient Large-Scale Language Model Training on GPU Clusters Using Megatron-LM (SOSP '21)
 */

export interface GPUNode {
  id: string;
  name: string;
  rackId: number;
  memoryTotalMB: number;
  memoryAllocatedMB: number;
  utilizationPct: number;
  temperatureC: number;
  status: 'HEALTHY' | 'THROTTLED' | 'OFFLINE';
}

export interface InterconnectLink {
  sourceGPU: string;
  targetGPU: string;
  type: 'NVLINK' | 'PCIE' | 'INFINIBAND';
  bandwidthGBs: number;
  saturated: boolean;
}

export interface ParallelismConfig {
  tensorParallel: number; // TP
  pipelineParallel: number; // PP
  dataParallel: number; // DP
  totalGPUs: number;
}

export type ZeROStage = 'ZeRO-0' | 'ZeRO-1' | 'ZeRO-2' | 'ZeRO-3';

export interface MicrobatchStep {
  stage: number;
  microbatch: number;
  phase: 'F' | 'B' | 'BUBBLE';
  tick: number;
}

export interface PipelineScheduleState {
  numStages: number;
  microbatches: number;
  activeSteps: MicrobatchStep[];
  bubbleFraction: number; // (PP - 1) / (M + PP - 1)
  inFlightActivations: number;
}

export interface RingAllReduceState {
  step: 'IDLE' | 'SCATTER_REDUCE' | 'ALLGATHER' | 'DONE';
  currentChunk: number;
  totalChunks: number;
  activeTransfers: Array<{ fromGPU: string; toGPU: string; chunkIndex: number }>;
}

export interface ModelWeightShard {
  shardId: string;
  rank: number;
  layerRange: [number, number];
  parameterHash: number;
  fp32MasterWeightSum: number;
}

export interface OptimizerState {
  step: number;
  learningRate: number;
  beta1: number;
  beta2: number;
  weightDecay: number;
}

export interface GPUCheckpoint {
  checkpointId: string;
  step: number;
  epoch: number;
  modelFlopsUtilizationPct: number;
  weightShards: ModelWeightShard[];
  optimizerState: OptimizerState;
  checksum: string;
  corrupted?: boolean;
}

export interface TrainingJobState {
  jobId: string;
  currentStep: number;
  totalSteps: number;
  status: 'TRAINING' | 'PREEMPTED' | 'RESTARTING' | 'COMPLETED';
  lastCheckpoint: GPUCheckpoint | null;
}

export interface GPUClusterState {
  clusterId: string;
  tick: number;
  gpus: Record<string, GPUNode>;
  interconnects: InterconnectLink[];
  parallelismConfig: ParallelismConfig;
  zeroStage: ZeROStage;
  pipelineSchedule: PipelineScheduleState;
  allReduceState: RingAllReduceState;
  trainingJob?: TrainingJobState;
  metrics: {
    modelFlopsUtilizationPct: number;
    stepTimeMs: number;
    memorySavingsRatio: number;
  };
}

export type GPUClusterSimEvent =
  | { id: string; tick: number; type: 'GPU_TICK'; payload: Record<string, unknown> }
  | {
      id: string;
      tick: number;
      type: 'GPU_STEP_1F1B';
      payload?: Record<string, unknown> | undefined;
    }
  | {
      id: string;
      tick: number;
      type: 'GPU_STEP_ALLREDUCE';
      payload?: Record<string, unknown> | undefined;
    }
  | {
      id: string;
      tick: number;
      type: 'GPU_SET_PARALLELISM';
      payload: {
        tp: number;
        pp: number;
        dp: number;
      };
    }
  | {
      id: string;
      tick: number;
      type: 'GPU_SET_ZERO_STAGE';
      payload: {
        stage: ZeROStage;
      };
    }
  | {
      id: string;
      tick: number;
      type: 'GPU_THROTTLE_STRAGGLER';
      payload: {
        gpuId: string;
        throttled: boolean;
      };
    }
  | {
      id: string;
      tick: number;
      type: 'GPU_SEVER_NVLINK';
      payload: {
        sourceGPU: string;
        targetGPU: string;
      };
    }
  | {
      id: string;
      tick: number;
      type: 'GPU_SPOT_PREEMPTION';
      payload?: { saveCheckpoint?: boolean } | undefined;
    }
  | {
      id: string;
      tick: number;
      type: 'GPU_RESUME_TRAINING';
      payload?: { forceCorruptedCheckpoint?: boolean } | undefined;
    }
  | {
      id: string;
      tick: number;
      type: 'GPU_CORRUPT_CHECKPOINT';
      payload?: Record<string, unknown> | undefined;
    }
  | {
      id: string;
      tick: number;
      type: 'GPU_CHECKPOINT_CORRUPT_RESTART';
      payload: {
        reason: string;
        expectedChecksum?: string;
        actualChecksum?: string;
        restartedAtStep: number;
      };
    }
  | {
      id: string;
      tick: number;
      type: 'GPU_RESUME_FROM_CHECKPOINT';
      payload: {
        checkpointId: string;
        resumedAtStep: number;
      };
    };

