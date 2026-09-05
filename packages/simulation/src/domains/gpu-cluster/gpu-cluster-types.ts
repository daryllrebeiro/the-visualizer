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

export interface GPUClusterState {
  clusterId: string;
  tick: number;
  gpus: Record<string, GPUNode>;
  interconnects: InterconnectLink[];
  parallelismConfig: ParallelismConfig;
  zeroStage: ZeROStage;
  pipelineSchedule: PipelineScheduleState;
  allReduceState: RingAllReduceState;
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
    };
