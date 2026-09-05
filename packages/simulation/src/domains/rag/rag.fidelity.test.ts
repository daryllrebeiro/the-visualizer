import { describe, expect, it } from 'vitest';

import { DeterministicRNG } from '../../prng/deterministic-rng.js';
import {
  calculateRRF,
  cosineSimilarity,
  lostInTheMiddleReorder,
} from './rag-algorithms.js';
import { RAGInvariantChecker } from './rag-invariants.js';
import { createDefaultRAGCluster, pureRAGTransition } from './rag-state-transitions.js';
import type { RAGClusterState } from './rag-types.js';

describe('Domain 9: Retrieval-Augmented Generation Fidelity & Invariants', () => {
  const rng = new DeterministicRNG(42);
  const checker = new RAGInvariantChecker();

  it('RAG-1: prevents context window overflow during packing', () => {
    let state = createDefaultRAGCluster();
    expect(checker.check(state)).toBeNull();

    // Query execution automatically packs context within maxBudgetTokens (1024)
    const transition = pureRAGTransition(
      state,
      {
        id: 'evt-1',
        tick: 1,
        type: 'RAG_EXECUTE_QUERY',
        payload: {
          queryId: 'q-1',
          text: 'Raft consensus leader election',
        },
      },
      rng,
    );
    state = transition.nextState;

    const totalTokens =
      state.contextWindow.systemPromptTokens +
      state.contextWindow.queryTokens +
      state.contextWindow.packedChunks.reduce((acc, c) => acc + c.tokens, 0);

    expect(totalTokens).toBeLessThanOrEqual(state.contextWindow.maxBudgetTokens);
    expect(checker.check(state)).toBeNull();

    // Force an invalid state exceeding max budget to verify invariant violation detection
    const overflowState: RAGClusterState = JSON.parse(JSON.stringify(state)) as RAGClusterState;
    overflowState.contextWindow.maxBudgetTokens = 100; // Force budget lower than system + query
    const violation = checker.check(overflowState);
    expect(violation).not.toBeNull();
    expect(violation?.ruleId).toBe('RAG-1');
  });

  it('RAG-2: verifies monotonic re-rank filtering', () => {
    let state = createDefaultRAGCluster();
    const transition = pureRAGTransition(
      state,
      {
        id: 'evt-2',
        tick: 2,
        type: 'RAG_EXECUTE_QUERY',
        payload: {
          queryId: 'q-2',
          text: 'Consistent hash rings Dynamo vnodes',
        },
      },
      rng,
    );
    state = transition.nextState;
    expect(state.activeQuery).not.toBeNull();
    expect(checker.check(state)).toBeNull();

    // Inject illegal reranked chunk not present in stage 1
    const illegalState: RAGClusterState = JSON.parse(JSON.stringify(state)) as RAGClusterState;
    if (illegalState.activeQuery) {
      illegalState.activeQuery.rerankedMatches.push({
        chunkId: 'chunk-phantom-unretrieved',
        score: 0.99,
        rank: 1,
      });
    }
    const violation = checker.check(illegalState);
    expect(violation).not.toBeNull();
    expect(violation?.ruleId).toBe('RAG-2');
  });

  it('RAG-3: validates citation grounding against context window', () => {
    let state = createDefaultRAGCluster();
    state = pureRAGTransition(
      state,
      {
        id: 'evt-3',
        tick: 3,
        type: 'RAG_EXECUTE_QUERY',
        payload: { queryId: 'q-3', text: 'Kafka ISR replication' },
      },
      rng,
    ).nextState;

    state = pureRAGTransition(
      state,
      {
        id: 'evt-4',
        tick: 4,
        type: 'RAG_SYNTHESIZE_RESPONSE',
        payload: { queryId: 'q-3' },
      },
      rng,
    ).nextState;

    expect(checker.check(state)).toBeNull();

    // Inject hallucinated citation
    const hallucinatedState: RAGClusterState = JSON.parse(
      JSON.stringify(state),
    ) as RAGClusterState;
    if (hallucinatedState.activeQuery) {
      hallucinatedState.activeQuery.citations = ['chunk-nonexistent'];
    }
    const violation = checker.check(hallucinatedState);
    expect(violation).not.toBeNull();
    expect(violation?.ruleId).toBe('RAG-3');
    expect(violation?.isPedagogicalFlaw).toBe(true);
  });

  it('verifies Cormack RRF and Liu Lost-in-the-Middle mathematical properties', () => {
    // 1. Reciprocal Rank Fusion
    const dense = [
      { chunkId: 'c1', score: 0.9, rank: 1 },
      { chunkId: 'c2', score: 0.8, rank: 2 },
    ];
    const sparse = [
      { chunkId: 'c2', score: 0.95, rank: 1 },
      { chunkId: 'c3', score: 0.7, rank: 2 },
    ];
    const rrf = calculateRRF(dense, sparse, 60, 0.5, 0.5);
    // c2 is in both dense (rank 2) and sparse (rank 1), so should lead
    expect(rrf[0]?.chunkId).toBe('c2');
    expect(rrf[0]?.rrfScore).toBeGreaterThan(rrf[1]?.rrfScore ?? 0);

    // 2. Lost in the middle reorder
    const items = ['item-1', 'item-2', 'item-3', 'item-4'];
    const reordered = lostInTheMiddleReorder(items);
    // Highest ranked item-1 at left extreme (0), second highest item-2 at right extreme (3)
    expect(reordered[0]).toBe('item-1');
    expect(reordered[reordered.length - 1]).toBe('item-2');

    // 3. Cosine similarity normalization
    expect(cosineSimilarity([1, 0], [1, 0])).toBe(1.0);
    expect(cosineSimilarity([1, 0], [-1, 0])).toBe(0.0);
  });
});
