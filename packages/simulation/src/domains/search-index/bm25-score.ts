/**
 * BM25 shared core — the single source of BM25 arithmetic on the platform.
 *
 * Two forms live here deliberately:
 *
 * 1. `computeBM25Score` — the simplified pedagogical form used by the
 *    /rag domain since its inception (normalized IDF constant + sigmoid
 *    squash). Byte-identical to the original /rag implementation;
 *    /rag re-exports it so there is exactly one BM25 code path and the
 *    /rag golden determinism hashes remain unchanged.
 *
 * 2. `bm25Idf` / `bm25TermContribution` / `bm25FullScore` — the real
 *    Robertson & Zaragoza (2009) / Lucene BM25Similarity formula used
 *    by the /search-index domain:
 *
 *      idf(t)   = ln(1 + (N - df + 0.5) / (df + 0.5))
 *      tf-part  = tf * (k1 + 1) / (tf + k1 * (1 - b + b * dl / avgdl))
 *      score(d) = sum over query terms t of idf(t) * tf-part(t, d)
 *
 * References:
 * - Robertson & Zaragoza (2009): The Probabilistic Relevance Framework:
 *   BM25 and Beyond
 * - Lucene BM25Similarity (the ln(1 + ...) IDF variant)
 */

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

/** Lucene BM25 IDF: ln(1 + (N - df + 0.5) / (df + 0.5)). */
export function bm25Idf(docCount: number, docFreq: number): number {
  if (docCount <= 0 || docFreq <= 0) return 0;
  return Math.log(1 + (docCount - docFreq + 0.5) / (docFreq + 0.5));
}

/**
 * Per-term tf saturation component:
 * tf * (k1 + 1) / (tf + k1 * (1 - b + b * dl / avgdl))
 */
export function bm25TfComponent(
  termFreq: number,
  docLength: number,
  avgDocLength: number,
  k1: number,
  b: number,
): number {
  if (termFreq <= 0) return 0;
  const numerator = termFreq * (k1 + 1);
  const denominator = termFreq + k1 * (1 - b + b * (docLength / Math.max(1, avgDocLength)));
  return numerator / Math.max(0.0001, denominator);
}

export interface BM25TermBreakdown {
  term: string;
  tf: number;
  idf: number;
  tfComponent: number;
  contribution: number;
}

/**
 * Full-formula BM25 score with per-term breakdown (the /search-index
 * flagship arithmetic view). Pure: all statistics are inputs.
 */
export function bm25FullScore(
  queryTerms: string[],
  termFreqs: Record<string, number>,
  docLength: number,
  avgDocLength: number,
  docCount: number,
  docFreqs: Record<string, number>,
  k1: number,
  b: number,
): { score: number; breakdown: BM25TermBreakdown[] } {
  let score = 0;
  const breakdown: BM25TermBreakdown[] = [];
  for (const term of queryTerms) {
    const tf = termFreqs[term] ?? 0;
    if (tf <= 0) continue;
    const df = docFreqs[term] ?? 0;
    const idf = bm25Idf(docCount, df);
    const tfComponent = bm25TfComponent(tf, docLength, avgDocLength, k1, b);
    const contribution = idf * tfComponent;
    score += contribution;
    breakdown.push({ term, tf, idf, tfComponent, contribution });
  }
  return { score, breakdown };
}

/** Quantize floats entering persisted/hashed state (platform rule 4.3). */
export function quantizeScore(x: number): number {
  return Math.round(x * 1e6) / 1e6;
}
