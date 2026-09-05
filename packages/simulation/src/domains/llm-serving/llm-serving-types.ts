/**
 * LLM Inference Serving & PagedAttention Simulation Types & State Model
 *
 * References:
 * - Kwon et al. (2023): Efficient Memory Management for Large Language Model Serving with PagedAttention (SOSP '23)
 * - Yu et al. (2022): Orca: A Distributed Serving System for Transformer-Based Generative Models (OSDI '22)
 * - Leviathan et al. (2023): Fast Inference from Transformers via Speculative Decoding (ICML '23)
 */

export type RequestState = 'WAITING' | 'PREFILL' | 'DECODE' | 'FINISHED' | 'PREEMPTED';

export interface InferenceRequest {
  id: string;
  promptTokens: number;
  maxGeneratedTokens: number;
  generatedTokens: number;
  state: RequestState;
  arrivalTimeTick: number;
  firstTokenTick?: number | undefined;
  completionTick?: number | undefined;
  speculativeAcceptedTokens: number;
  speculativeRejectedTokens: number;
}

export interface PhysicalKVBlock {
  blockIndex: number;
  requestId?: string | undefined;
  logicalBlockIndex?: number | undefined;
  refCount: number;
  isCoW: boolean;
}

export interface KVBlockPool {
  totalBlocks: number;
  blockSizeTokens: number;
  blocks: Record<number, PhysicalKVBlock>;
  freeBlockIndices: number[];
}

export interface ContinuousBatchScheduler {
  maxBatchSize: number;
  runningRequestIds: string[];
  preemptedRequestIds: string[];
  prefillChunkSize: number;
}

export interface SpeculativeEngineState {
  enabled: boolean;
  draftModelName: string;
  targetModelName: string;
  gammaLookahead: number;
  draftAcceptanceRate: number;
}

export interface LLMServingClusterState {
  clusterId: string;
  tick: number;
  kvBlockPool: KVBlockPool;
  requests: Record<string, InferenceRequest>;
  blockTable: Record<string, number[]>; // requestId -> physicalBlockIndices
  batchScheduler: ContinuousBatchScheduler;
  speculativeEngine: SpeculativeEngineState;
  metrics: {
    totalCompleted: number;
    avgTtftTicks: number;
    avgItlTicks: number;
    gpuVramUtilizationPct: number;
    preemptionCount: number;
  };
}

export type LLMServingSimEvent =
  | { id: string; tick: number; type: 'LLM_TICK'; payload: Record<string, unknown> }
  | {
      id: string;
      tick: number;
      type: 'LLM_SUBMIT_REQUEST';
      payload: {
        requestId: string;
        promptTokens: number;
        maxGeneratedTokens: number;
      };
    }
  | {
      id: string;
      tick: number;
      type: 'LLM_STEP_BATCH';
      payload?: Record<string, unknown> | undefined;
    }
  | {
      id: string;
      tick: number;
      type: 'LLM_PREEMPT_REQUEST';
      payload: {
        requestId: string;
      };
    }
  | {
      id: string;
      tick: number;
      type: 'LLM_TOGGLE_SPECULATIVE';
      payload: {
        enabled: boolean;
        gamma?: number | undefined;
        draftAcceptanceRate?: number | undefined;
      };
    }
  | {
      id: string;
      tick: number;
      type: 'LLM_TOGGLE_CHUNKED_PREFILL';
      payload: {
        prefillChunkSize: number;
      };
    }
  | {
      id: string;
      tick: number;
      type: 'LLM_OOM_INJECTION';
      payload: {
        count: number;
      };
    };
