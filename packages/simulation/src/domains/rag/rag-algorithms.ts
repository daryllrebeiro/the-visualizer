/**
 * Retrieval-Augmented Generation Mathematical Algorithms
 *
 * References:
 * - Cormack, Clarke, & Büttcher (2009): Reciprocal Rank Fusion outperforms Condorcet and individual Rank Learning
 * - Robertson & Zaragoza (2009): The Probabilistic Relevance Framework: BM25 and Beyond
 * - Liu et al. (2023): Lost in the Middle: How Language Models Use Long Contexts
 */

import type { RAGChunk, RRFMatch, RetrievalMatch } from './rag-types.js';

export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length === 0 || vecB.length === 0 || vecA.length !== vecB.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    const a = vecA[i] ?? 0;
    const b = vecB[i] ?? 0;
    dotProduct += a * b;
    normA += a * a;
    normB += b * b;
  }

  if (normA <= 0 || normB <= 0) return 0;
  const similarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  // Normalize to [0, 1] range for stability
  return Math.max(0, Math.min(1, (similarity + 1) / 2));
}

export function computeBM25Score(
  queryTokens: string[],
  docTerms: Record<string, number>,
  docLength: number,
  avgDocLength = 100,
  k1 = 1.2,
  b = 0.75,
): number {
  if (queryTokens.length === 0 || docLength === 0) return 0;
  let score = 0;

  for (const token of queryTokens) {
    const termFreq = docTerms[token.toLowerCase()] ?? 0;
    if (termFreq > 0) {
      const idf = 1.5; // Normalized IDF constant for deterministic simulation
      const numerator = termFreq * (k1 + 1);
      const denominator = termFreq + k1 * (1 - b + b * (docLength / Math.max(1, avgDocLength)));
      score += idf * (numerator / Math.max(0.001, denominator));
    }
  }

  // Normalize into [0, 1] range via sigmoid approximation
  return 1 / (1 + Math.exp(-score / 2));
}

/**
 * Reciprocal Rank Fusion (RRF)
 * Formula: RRF_score(d) = sum_{m in models} weight_m / (k + rank_m(d))
 */
export function calculateRRF(
  denseMatches: RetrievalMatch[],
  sparseMatches: RetrievalMatch[],
  rrfK = 60,
  denseWeight = 0.5,
  sparseWeight = 0.5,
): RRFMatch[] {
  const scores = new Map<string, number>();

  for (const match of denseMatches) {
    const contribution = denseWeight / (rrfK + match.rank);
    scores.set(match.chunkId, (scores.get(match.chunkId) ?? 0) + contribution);
  }

  for (const match of sparseMatches) {
    const contribution = sparseWeight / (rrfK + match.rank);
    scores.set(match.chunkId, (scores.get(match.chunkId) ?? 0) + contribution);
  }

  const sorted = Array.from(scores.entries())
    .map(([chunkId, rrfScore]) => ({ chunkId, rrfScore, rank: 0 }))
    .sort((a, b) => b.rrfScore - a.rrfScore);

  sorted.forEach((item, idx) => {
    item.rank = idx + 1;
  });

  return sorted;
}

/**
 * Lost-in-the-Middle Context Window Reordering (Liu et al. 2023)
 * Reorders top chunks such that highest-ranked chunks are placed at the extremes
 * (beginning and end) where LLM attention is strongest.
 */
export function lostInTheMiddleReorder<T>(items: T[]): T[] {
  if (items.length <= 2) return [...items];

  const result: T[] = new Array(items.length) as T[];
  let left = 0;
  let right = items.length - 1;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item === undefined) continue;
    if (i % 2 === 0) {
      result[left] = item;
      left++;
    } else {
      result[right] = item;
      right--;
    }
  }

  return result;
}

/**
 * Deterministic Cross-Encoder Re-Ranking
 */
export function crossEncoderRerank(
  queryVector: number[],
  candidateChunks: RAGChunk[],
  topN = 3,
): RetrievalMatch[] {
  const scored = candidateChunks.map((chunk) => {
    // Cross-encoder simulation combines dense similarity + term richness
    const similarity = cosineSimilarity(queryVector, chunk.denseVector);
    const termRichness = Math.min(1, Object.keys(chunk.sparseTerms).length / 20);
    const score = Math.min(1, similarity * 0.7 + termRichness * 0.3);
    return {
      chunkId: chunk.id,
      score,
      rank: 0,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  const cut = scored.slice(0, topN);
  cut.forEach((item, idx) => {
    item.rank = idx + 1;
  });

  return cut;
}
