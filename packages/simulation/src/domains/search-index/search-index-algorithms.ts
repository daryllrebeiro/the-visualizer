/**
 * Search analyzer, sharding, and scatter-gather algorithms — pure.
 */

import { fnv1a32 } from '../consistent-hashing/consistent-hashing-algorithms.js';
import type {
  ScoredDoc,
  SearchAnalyzerConfig,
  SearchDocument,
  SearchIndexClusterState,
  SearchShard,
} from './search-index-types.js';
import { SEARCH_STOPWORDS } from './search-index-types.js';
import { bm25FullScore, quantizeScore } from './bm25-score.js';

/** Analyzer pipeline (mode-aware, exact per tokenizer). */
export function analyze(text: string, config: SearchAnalyzerConfig): string[] {
  let tokens: string[];
  switch (config.tokenizer) {
    case 'STANDARD':
      tokens = text
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length > 0);
      break;
    case 'SIMPLE':
      tokens = text
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t.length > 0);
      break;
    case 'KEYWORD':
      tokens = [text.toLowerCase().trim()];
      break;
  }
  if (config.stopwordRemoval) {
    tokens = tokens.filter((t) => !SEARCH_STOPWORDS.has(t));
  }
  return tokens;
}

export function buildDocument(id: string, rawText: string, analyzer: SearchAnalyzerConfig): SearchDocument {
  const tokens = analyze(rawText, analyzer);
  const termFreqs: Record<string, number> = {};
  tokens.forEach((token, position) => {
    termFreqs[token] = (termFreqs[token] ?? 0) + 1;
    void position;
  });
  return { id, rawText, tokens, termFreqs, length: tokens.length };
}

/** Rebuild positions per term (posting-list construction). */
export function termPositions(doc: SearchDocument, term: string): number[] {
  const positions: number[] = [];
  doc.tokens.forEach((token, i) => {
    if (token === term) positions.push(i);
  });
  return positions;
}

/** Shard assignment: hash(docId) % shardCount (deterministic). */
export function shardForDoc(docId: string, shardIds: ReadonlyArray<string>): string {
  if (shardIds.length === 0) {
    throw new Error('shardForDoc: no shards');
  }
  const h = fnv1a32(`shard::${docId}`, 0x811c9dc5);
  return shardIds[h % shardIds.length] as string;
}

export interface ShardStats {
  docCount: number;
  avgDocLength: number;
  docFreqs: Record<string, number>;
}

/** Per-shard local statistics (Elasticsearch default: idf per shard). */
export function shardStats(shard: SearchShard, documents: Record<string, SearchDocument>): ShardStats {
  const docFreqs: Record<string, number> = {};
  let totalLength = 0;
  let count = 0;
  for (const docId of shard.docIds) {
    const doc = documents[docId];
    if (!doc) continue;
    count++;
    totalLength += doc.length;
    for (const term of Object.keys(doc.termFreqs)) {
      docFreqs[term] = (docFreqs[term] ?? 0) + 1;
    }
  }
  return {
    docCount: count,
    avgDocLength: count > 0 ? totalLength / count : 0,
    docFreqs,
  };
}

export interface ShardQueryResult {
  shardId: string;
  servedBy: string;
  participated: boolean;
  topK: Array<{ docId: string; score: number }>;
  scored: ScoredDoc[];
}

/**
 * Per-shard gather: score the shard's documents against the query terms
 * using the REAL BM25 formula with local shard statistics. When the
 * primary is down, a live replica serves (SEARCH-3: replicas mirror the
 * primary exactly, so results are identical).
 */
export function gatherFromShard(
  shard: SearchShard,
  servedBy: 'PRIMARY' | string,
  terms: string[],
  topK: number,
  documents: Record<string, SearchDocument>,
  bm25: { k1: number; b: number },
): ShardQueryResult {
  const stats = shardStats(shard, documents);
  const scored: ScoredDoc[] = [];
  for (const docId of shard.docIds) {
    const doc = documents[docId];
    if (!doc) continue;
    const { score, breakdown } = bm25FullScore(
      terms,
      doc.termFreqs,
      doc.length,
      stats.avgDocLength,
      stats.docCount,
      stats.docFreqs,
      bm25.k1,
      bm25.b,
    );
    if (breakdown.length === 0) continue; // non-matching doc: not a result
    scored.push({
      docId,
      shardId: shard.id,
      score: quantizeScore(score),
      breakdown: breakdown.map((b) => ({
        term: b.term,
        tf: b.tf,
        idf: quantizeScore(b.idf),
        tfComponent: quantizeScore(b.tfComponent),
        contribution: quantizeScore(b.contribution),
      })),
    });
  }
  scored.sort((a, b) => b.score - a.score || a.docId.localeCompare(b.docId));
  return {
    shardId: shard.id,
    servedBy,
    participated: true,
    topK: scored.slice(0, topK).map((s) => ({ docId: s.docId, score: s.score })),
    scored,
  };
}

/** Merge per-shard results into the global top-k (score desc, docId asc). */
export function mergeGatherResults(shardResults: ReadonlyArray<ShardQueryResult>, topK: number): ScoredDoc[] {
  const all: ScoredDoc[] = [];
  for (const result of shardResults) {
    // Top-k from each shard: exact global top-k since scores are per-doc.
    all.push(...result.scored.slice(0, topK));
  }
  all.sort((a, b) => b.score - a.score || a.docId.localeCompare(b.docId));
  return all.slice(0, topK);
}

/** Whether a shard can serve queries (primary or any online replica). */
export function shardServing(shard: SearchShard): { canServe: boolean; servedBy: string } {
  if (shard.primaryOnline) {
    return { canServe: true, servedBy: `${shard.id}-primary` };
  }
  const live = shard.replicas.find((r) => r.online);
  if (live) {
    return { canServe: true, servedBy: `${shard.id}-replica:${live.id}` };
  }
  return { canServe: false, servedBy: 'none' };
}

export type { SearchIndexClusterState };
