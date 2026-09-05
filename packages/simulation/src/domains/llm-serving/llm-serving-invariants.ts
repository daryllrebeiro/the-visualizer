/**
 * LLM Inference Serving & PagedAttention Invariant Checker
 *
 * Invariants:
 * - LLM-1: Zero Block Collision (physical block not shared without refCount > 1 / CoW)
 * - LLM-2: Continuous Batching Memory Ceiling (allocated blocks <= total GPU pool; no OOM leakage)
 * - LLM-3: Speculative Token Correctness (accepted tokens within gamma lookahead bound)
 * - LLM-4: Monotonic Request Forwarding (prefill must complete before decoding starts)
 */

import type { LLMServingClusterState } from './llm-serving-types.js';

export interface LLMInvariantViolation {
  ruleId: 'LLM-1' | 'LLM-2' | 'LLM-3' | 'LLM-4';
  invariantName: string;
  description: string;
  isPedagogicalFlaw?: boolean | undefined;
}

export class LLMServingInvariantChecker {
  public check(state: LLMServingClusterState): LLMInvariantViolation | null {
    const { kvBlockPool, blockTable, requests, speculativeEngine } = state;

    // 1. LLM-1: Zero Block Collision
    const blockOwners = new Map<number, string>();
    for (const [reqId, blockIndices] of Object.entries(blockTable)) {
      for (const blockIdx of blockIndices) {
        const physical = kvBlockPool.blocks[blockIdx];
        if (physical && physical.refCount === 1) {
          const priorOwner = blockOwners.get(blockIdx);
          if (priorOwner && priorOwner !== reqId) {
            return {
              ruleId: 'LLM-1',
              invariantName: 'Zero Block Collision',
              description: `Physical KV block ${String(blockIdx)} collided between request "${priorOwner}" and "${reqId}" without CoW sharing.`,
            };
          }
          blockOwners.set(blockIdx, reqId);
        }
      }
    }

    // 2. LLM-2: Continuous Batching Memory Ceiling
    const totalAllocated = Object.values(kvBlockPool.blocks).filter(
      (b) => b.requestId !== undefined,
    ).length;
    if (totalAllocated > kvBlockPool.totalBlocks) {
      return {
        ruleId: 'LLM-2',
        invariantName: 'Continuous Batching Memory Ceiling',
        description: `GPU VRAM KV block exhaustion: allocated ${String(totalAllocated)} blocks out of total capacity ${String(kvBlockPool.totalBlocks)}.`,
      };
    }

    if (totalAllocated + kvBlockPool.freeBlockIndices.length !== kvBlockPool.totalBlocks) {
      return {
        ruleId: 'LLM-2',
        invariantName: 'Continuous Batching Memory Ceiling',
        description: `KV block accounting leak: allocated (${String(totalAllocated)}) + free (${String(kvBlockPool.freeBlockIndices.length)}) != total (${String(kvBlockPool.totalBlocks)}).`,
      };
    }

    // 3. LLM-3: Speculative Token Correctness
    if (speculativeEngine.enabled) {
      for (const req of Object.values(requests)) {
        if (req.speculativeAcceptedTokens > req.generatedTokens) {
          return {
            ruleId: 'LLM-3',
            invariantName: 'Speculative Token Correctness',
            description: `Speculative accepted tokens (${String(req.speculativeAcceptedTokens)}) exceeds total generated tokens (${String(req.generatedTokens)}) for request "${req.id}".`,
          };
        }
      }
    }

    // 4. LLM-4: Monotonic Request Forwarding
    for (const req of Object.values(requests)) {
      if ((req.state === 'WAITING' || req.state === 'PREFILL') && req.generatedTokens > 0) {
        return {
          ruleId: 'LLM-4',
          invariantName: 'Monotonic Request Forwarding',
          description: `Request "${req.id}" has ${String(req.generatedTokens)} generated tokens while still in "${req.state}" state before prefill completion.`,
        };
      }
    }

    return null;
  }
}
