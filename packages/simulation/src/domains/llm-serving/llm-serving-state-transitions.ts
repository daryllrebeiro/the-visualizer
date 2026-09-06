/**
 * LLM Inference Serving & PagedAttention State Transitions Reducer
 */

import type { DeterministicRNG } from '../../prng/deterministic-rng.js';
import type {
  InferenceRequest,
  LLMServingClusterState,
  LLMServingSimEvent,
  PhysicalKVBlock,
} from './llm-serving-types.js';

export function generateTokenForPosition(
  requestId: string,
  promptTokens: number,
  tokenIndex: number,
  seed = 42,
  previousTokens: number[] = [],
): number {
  // Fold running hash of all prior tokens in the KV cache
  let kvContextHash = 0x811c9dc5;
  for (let idx = 0; idx < previousTokens.length; idx++) {
    const tok = previousTokens[idx]!;
    kvContextHash ^= (tok & 0xff);
    kvContextHash = Math.imul(kvContextHash, 0x01000193) >>> 0;
    kvContextHash ^= ((tok >>> 8) & 0xff);
    kvContextHash = Math.imul(kvContextHash, 0x01000193) >>> 0;
    kvContextHash ^= ((tok >>> 16) & 0xff);
    kvContextHash = Math.imul(kvContextHash, 0x01000193) >>> 0;
    kvContextHash ^= ((tok >>> 24) & 0xff);
    kvContextHash = Math.imul(kvContextHash, 0x01000193) >>> 0;
    kvContextHash = (kvContextHash ^ ((idx + 1) * 31)) >>> 0;
  }

  let h = (seed ^ (promptTokens * 10007) ^ (tokenIndex * 31) ^ kvContextHash) >>> 0;
  for (let i = 0; i < requestId.length; i++) {
    h = (h ^ (requestId.charCodeAt(i) * 37)) >>> 0;
  }
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}


export function createDefaultLLMServingCluster(clusterId = 'llm-serving-1'): LLMServingClusterState {
  const totalBlocks = 32;
  const blockSizeTokens = 16;
  const blocks: Record<number, PhysicalKVBlock> = {};
  const freeBlockIndices: number[] = [];

  for (let i = 0; i < totalBlocks; i++) {
    blocks[i] = {
      blockIndex: i,
      refCount: 0,
      isCoW: false,
    };
    freeBlockIndices.push(i);
  }

  // Pre-seed 2 initial requests
  const req1: InferenceRequest = {
    id: 'req-1',
    promptTokens: 48, // requires 3 blocks
    maxGeneratedTokens: 32,
    generatedTokens: 0,
    outputTokens: [],
    seed: 42,
    state: 'WAITING',
    arrivalTimeTick: 0,
    speculativeAcceptedTokens: 0,
    speculativeRejectedTokens: 0,
  };

  const req2: InferenceRequest = {
    id: 'req-2',
    promptTokens: 32, // requires 2 blocks
    maxGeneratedTokens: 48,
    generatedTokens: 0,
    outputTokens: [],
    seed: 42,
    state: 'WAITING',
    arrivalTimeTick: 0,
    speculativeAcceptedTokens: 0,
    speculativeRejectedTokens: 0,
  };

  return {
    clusterId,
    tick: 0,
    kvBlockPool: {
      totalBlocks,
      blockSizeTokens,
      blocks,
      freeBlockIndices,
    },
    requests: {
      'req-1': req1,
      'req-2': req2,
    },
    blockTable: {},
    batchScheduler: {
      maxBatchSize: 4,
      runningRequestIds: [],
      preemptedRequestIds: [],
      prefillChunkSize: 32,
    },
    speculativeEngine: {
      enabled: true,
      draftModelName: 'Draft-1B',
      targetModelName: 'Target-70B',
      gammaLookahead: 3,
      draftAcceptanceRate: 0.75,
    },
    metrics: {
      totalCompleted: 0,
      avgTtftTicks: 2.0,
      avgItlTicks: 1.0,
      gpuVramUtilizationPct: 0.0,
      preemptionCount: 0,
    },
  };
}

function allocateBlocksForRequest(
  state: LLMServingClusterState,
  requestId: string,
  neededBlocks: number,
): boolean {
  if (state.kvBlockPool.freeBlockIndices.length < neededBlocks) {
    return false; // Insufficient VRAM blocks
  }

  const assigned: number[] = [];
  for (let i = 0; i < neededBlocks; i++) {
    const blockIdx = state.kvBlockPool.freeBlockIndices.shift();
    if (blockIdx !== undefined) {
      const block = state.kvBlockPool.blocks[blockIdx];
      if (block) {
        block.requestId = requestId;
        block.logicalBlockIndex = (state.blockTable[requestId]?.length ?? 0) + i;
        block.refCount = 1;
        block.isCoW = false;
      }
      assigned.push(blockIdx);
    }
  }

  if (!state.blockTable[requestId]) {
    state.blockTable[requestId] = [];
  }
  state.blockTable[requestId].push(...assigned);
  return true;
}

function freeBlocksForRequest(state: LLMServingClusterState, requestId: string): void {
  const blocks = state.blockTable[requestId] ?? [];
  for (const blockIdx of blocks) {
    const block = state.kvBlockPool.blocks[blockIdx];
    if (block) {
      block.refCount = Math.max(0, block.refCount - 1);
      if (block.refCount === 0) {
        block.requestId = undefined;
        block.logicalBlockIndex = undefined;
        block.isCoW = false;
        state.kvBlockPool.freeBlockIndices.push(blockIdx);
      }
    }
  }
  delete state.blockTable[requestId];
  // Keep free indices sorted
  state.kvBlockPool.freeBlockIndices.sort((a, b) => a - b);
}

export function pureLLMServingTransition(
  state: LLMServingClusterState,
  event: LLMServingSimEvent,
  rng: DeterministicRNG,
): { nextState: LLMServingClusterState; emittedEvents: LLMServingSimEvent[] } {
  const nextState: LLMServingClusterState = JSON.parse(
    JSON.stringify(state),
  ) as LLMServingClusterState;
  nextState.tick = event.tick;

  switch (event.type) {
    case 'TICK' as any:
    case 'LLM_TICK':
    case 'LLM_STEP_BATCH': {
      const { batchScheduler, kvBlockPool, requests } = nextState;

      // 1. Step currently running requests from previous ticks
      const stillRunning: string[] = [];
      for (const reqId of batchScheduler.runningRequestIds) {
        const req = requests[reqId];
        if (!req) continue;

        if (req.state === 'PREFILL') {
          // Prefill completed, transition to DECODE
          req.state = 'DECODE';
          if (!req.firstTokenTick) {
            req.firstTokenTick = nextState.tick;
          }
          stillRunning.push(reqId);
        } else if (req.state === 'DECODE') {
          // Generate token(s)
          let tokensGenerated = 1;
          if (nextState.speculativeEngine.enabled) {
            const remaining = Math.max(0, req.maxGeneratedTokens - req.generatedTokens - 1);
            const accepted =
              rng.nextFloat() < nextState.speculativeEngine.draftAcceptanceRate
                ? Math.min(nextState.speculativeEngine.gammaLookahead, remaining)
                : 0;
            tokensGenerated += accepted;
            req.speculativeAcceptedTokens += accepted;
            if (accepted < nextState.speculativeEngine.gammaLookahead) {
              req.speculativeRejectedTokens += 1;
            }
          }
          tokensGenerated = Math.min(
            tokensGenerated,
            Math.max(0, req.maxGeneratedTokens - req.generatedTokens),
          );

          if (!req.outputTokens) req.outputTokens = [];
          for (let i = 0; i < tokensGenerated; i++) {
            const tok = generateTokenForPosition(
              req.id,
              req.promptTokens,
              req.generatedTokens + i,
              req.seed ?? 42,
              req.outputTokens,
            );
            req.outputTokens.push(tok);
          }
          req.generatedTokens += tokensGenerated;

          // Check if new physical block is needed for newly generated tokens
          const totalTokens = req.promptTokens + req.generatedTokens;
          const blocksNeeded = Math.ceil(totalTokens / kvBlockPool.blockSizeTokens);
          const currentBlocks = nextState.blockTable[reqId]?.length ?? 0;

          if (blocksNeeded > currentBlocks) {
            const extra = blocksNeeded - currentBlocks;
            if (!allocateBlocksForRequest(nextState, reqId, extra)) {
              // OOM condition! Checkpoint & preempt request
              req.state = 'PREEMPTED';
              req.checkpoint = {
                position: req.generatedTokens,
                tokens: [...(req.outputTokens ?? [])],
                rngState: rng.getState(),
              };
              // Evict working state to simulate swap-out / memory liberation
              req.outputTokens = [];
              req.generatedTokens = 0;
              freeBlocksForRequest(nextState, reqId);
              if (!batchScheduler.preemptedRequestIds.includes(reqId)) {
                batchScheduler.preemptedRequestIds.push(reqId);
              }
              nextState.metrics.preemptionCount++;
              continue;
            }
          }

          if (req.generatedTokens >= req.maxGeneratedTokens) {
            req.state = 'FINISHED';
            req.completionTick = nextState.tick;
            freeBlocksForRequest(nextState, reqId);
            nextState.metrics.totalCompleted++;
          } else {
            stillRunning.push(reqId);
          }
        }
      }

      // 2a. Resume PREEMPTED requests from checkpoint if VRAM blocks available
      const stillPreempted: string[] = [];
      for (const preemptedId of batchScheduler.preemptedRequestIds) {
        const req = requests[preemptedId];
        if (!req || req.state !== 'PREEMPTED') continue;
        if (stillRunning.length >= batchScheduler.maxBatchSize) {
          stillPreempted.push(preemptedId);
          continue;
        }

        const totalTokens =
          req.promptTokens + (req.checkpoint ? req.checkpoint.position : req.generatedTokens);
        const blocksRequired = Math.ceil(totalTokens / kvBlockPool.blockSizeTokens);
        if (allocateBlocksForRequest(nextState, preemptedId, blocksRequired)) {
          // Successfully restored KV cache blocks from checkpoint!
          if (req.checkpoint) {
            req.generatedTokens = req.checkpoint.position;
            req.outputTokens = [...req.checkpoint.tokens];
          }
          req.state = 'DECODE';
          stillRunning.push(preemptedId);
        } else {
          stillPreempted.push(preemptedId);
        }
      }
      batchScheduler.preemptedRequestIds = stillPreempted;

      // 2b. Admit WAITING requests into PREFILL up to maxBatchSize
      for (const req of Object.values(requests)) {
        if (
          req.state === 'WAITING' &&
          stillRunning.length < batchScheduler.maxBatchSize
        ) {
          const blocksRequired = Math.ceil(req.promptTokens / kvBlockPool.blockSizeTokens);
          if (allocateBlocksForRequest(nextState, req.id, blocksRequired)) {
            req.state = 'PREFILL';
            stillRunning.push(req.id);
          } else {
            break;
          }
        }
      }

      batchScheduler.runningRequestIds = stillRunning;

      // Update VRAM utilization metric
      const allocated = kvBlockPool.totalBlocks - kvBlockPool.freeBlockIndices.length;
      nextState.metrics.gpuVramUtilizationPct = Number(
        ((allocated / kvBlockPool.totalBlocks) * 100).toFixed(1),
      );
      break;
    }

    case 'LLM_SUBMIT_REQUEST': {
      const { requestId, promptTokens, maxGeneratedTokens } = event.payload;
      nextState.requests[requestId] = {
        id: requestId,
        promptTokens,
        maxGeneratedTokens,
        generatedTokens: 0,
        outputTokens: [],
        seed: (event.payload as any).seed ?? 42,
        state: 'WAITING',
        arrivalTimeTick: nextState.tick,
        speculativeAcceptedTokens: 0,
        speculativeRejectedTokens: 0,
      };
      break;
    }

    case 'LLM_PREEMPT_REQUEST': {
      const { requestId } = event.payload;
      const req = nextState.requests[requestId];
      if (req && (req.state === 'PREFILL' || req.state === 'DECODE')) {
        req.state = 'PREEMPTED';
        req.checkpoint = {
          position: req.generatedTokens,
          tokens: [...(req.outputTokens ?? [])],
          rngState: rng.getState(),
        };
        // Evict working state to simulate swap-out / memory liberation
        req.outputTokens = [];
        req.generatedTokens = 0;
        freeBlocksForRequest(nextState, requestId);
        nextState.batchScheduler.runningRequestIds = nextState.batchScheduler.runningRequestIds.filter(
          (id) => id !== requestId,
        );
        if (!nextState.batchScheduler.preemptedRequestIds.includes(requestId)) {
          nextState.batchScheduler.preemptedRequestIds.push(requestId);
        }
        nextState.metrics.preemptionCount++;
      }
      break;
    }

    case 'LLM_TOGGLE_SPECULATIVE': {
      nextState.speculativeEngine.enabled = event.payload.enabled;
      if (event.payload.gamma) nextState.speculativeEngine.gammaLookahead = event.payload.gamma;
      if (event.payload.draftAcceptanceRate !== undefined) {
        nextState.speculativeEngine.draftAcceptanceRate = event.payload.draftAcceptanceRate;
      }
      break;
    }

    case 'LLM_TOGGLE_CHUNKED_PREFILL': {
      nextState.batchScheduler.prefillChunkSize = event.payload.prefillChunkSize;
      break;
    }

    case 'LLM_OOM_INJECTION': {
      // Submits flood of large requests to exhaust blocks
      for (let i = 0; i < event.payload.count; i++) {
        const reqId = `flood-req-${String(nextState.tick)}-${String(i)}`;
        nextState.requests[reqId] = {
          id: reqId,
          promptTokens: 128, // requires 8 blocks each
          maxGeneratedTokens: 64,
          generatedTokens: 0,
          state: 'WAITING',
          arrivalTimeTick: nextState.tick,
          speculativeAcceptedTokens: 0,
          speculativeRejectedTokens: 0,
        };
      }
      break;
    }
  }

  (nextState as any).rngState = rng.getState();
  return { nextState, emittedEvents: [] };
}
