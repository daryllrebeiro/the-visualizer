/**
 * Retrieval-Augmented Generation Invariant Checker
 *
 * Invariants:
 * - RAG-1: Context Window Non-Overflow (assembled prompt <= maxBudgetTokens)
 * - RAG-2: Monotonic Re-Rank Filtering (re-ranked chunks must be subset of initial candidate pool)
 * - RAG-3: Citation Grounding Validity (citations must reference chunks in active context window)
 * - RAG-4: Non-Negative Relevance Scores (scores normalized within [0, 1])
 */

import type { RAGClusterState } from './rag-types.js';

export interface RAGInvariantViolation {
  ruleId: 'RAG-1' | 'RAG-2' | 'RAG-3' | 'RAG-4';
  invariantName: string;
  description: string;
  isPedagogicalFlaw?: boolean | undefined;
}

export class RAGInvariantChecker {
  public check(state: RAGClusterState): RAGInvariantViolation | null {
    // 1. RAG-1: Context Window Non-Overflow
    const totalTokensInContext =
      state.contextWindow.systemPromptTokens +
      state.contextWindow.queryTokens +
      state.contextWindow.packedChunks.reduce((acc, c) => acc + c.tokens, 0);

    if (totalTokensInContext > state.contextWindow.maxBudgetTokens) {
      return {
        ruleId: 'RAG-1',
        invariantName: 'Context Window Non-Overflow',
        description: `Context window overflow: assembled prompt tokens (${totalTokensInContext}) exceeds max budget (${state.contextWindow.maxBudgetTokens}).`,
      };
    }

    // 2. RAG-2: Monotonic Re-Rank Filtering
    if (state.activeQuery) {
      const initialCandidateIds = new Set<string>([
        ...state.activeQuery.denseMatches.map((m) => m.chunkId),
        ...state.activeQuery.sparseMatches.map((m) => m.chunkId),
      ]);

      for (const reranked of state.activeQuery.rerankedMatches) {
        if (!initialCandidateIds.has(reranked.chunkId)) {
          return {
            ruleId: 'RAG-2',
            invariantName: 'Monotonic Re-Rank Filtering',
            description: `Re-ranked chunk "${reranked.chunkId}" was not part of the initial stage-1 retrieval candidate pool.`,
          };
        }
      }

      // 3. RAG-3: Citation Grounding Validity
      if (state.activeQuery.citations && state.activeQuery.citations.length > 0) {
        const packedChunkIds = new Set(state.contextWindow.packedChunks.map((c) => c.chunkId));
        for (const citation of state.activeQuery.citations) {
          if (!packedChunkIds.has(citation)) {
            return {
              ruleId: 'RAG-3',
              invariantName: 'Citation Grounding Validity',
              description: `Response generated citation to chunk "${citation}" which is not present in active prompt context window.`,
              isPedagogicalFlaw: true,
            };
          }
        }
      }

      // 4. RAG-4: Non-Negative Relevance Scores
      const allScoredMatches = [
        ...state.activeQuery.denseMatches,
        ...state.activeQuery.sparseMatches,
        ...state.activeQuery.rerankedMatches,
      ];
      for (const match of allScoredMatches) {
        if (match.score < 0 || match.score > 1.0001) {
          return {
            ruleId: 'RAG-4',
            invariantName: 'Non-Negative Relevance Scores',
            description: `Relevance score for chunk "${match.chunkId}" is outside valid [0, 1] range: ${match.score}.`,
          };
        }
      }
    }

    return null;
  }
}
