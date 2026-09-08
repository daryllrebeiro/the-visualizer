/**
 * Distributed Search & Inverted Index — simulation types.
 *
 * Elasticsearch/Lucene-style architecture: tokenization/analysis
 * pipeline, inverted index construction, real BM25 relevance scoring,
 * index sharding with replicas, and query-time scatter-gather.
 *
 * References:
 * - Robertson & Zaragoza (2009): The Probabilistic Relevance Framework:
 *   BM25 and Beyond — canonical practical BM25
 * - Sparck Jones (1972): IDF foundation
 * - Lucene BM25Similarity (ln(1 + ...) IDF variant)
 * - Elasticsearch docs: shard/replica architecture, query_then_fetch
 */

export type SearchTokenizer = 'STANDARD' | 'SIMPLE' | 'KEYWORD';

export interface SearchAnalyzerConfig {
  tokenizer: SearchTokenizer;
  stopwordRemoval: boolean;
}

export interface SearchDocument {
  id: string;
  rawText: string;
  tokens: string[];
  /** term frequencies over analyzed tokens */
  termFreqs: Record<string, number>;
  /** analyzed token count (document length for BM25) */
  length: number;
}

export interface PostingEntry {
  docId: string;
  tf: number;
  positions: number[];
}

export interface SearchShardReplica {
  id: string;
  online: boolean;
  /** documents synced to this replica (SEARCH-4 bounded propagation) */
  indexedDocIds: string[];
}

export interface SearchShard {
  id: string;
  /** documents assigned to (and indexed on) the primary */
  docIds: string[];
  primaryOnline: boolean;
  replicas: SearchShardReplica[];
  /** documents pending replica sync: docId -> tick ingested on primary */
  pendingSync: Record<string, number>;
  lastSyncTick: number;
}

export interface BM25TermBreakdownState {
  term: string;
  tf: number;
  idf: number;
  tfComponent: number;
  contribution: number;
}

export interface ScoredDoc {
  docId: string;
  shardId: string;
  score: number;
  breakdown: BM25TermBreakdownState[];
}

export interface QueryGatherEntry {
  shardId: string;
  participated: boolean;
  servedBy: string;
  topK: Array<{ docId: string; score: number }>;
}

export interface SearchQueryState {
  id: string;
  text: string;
  terms: string[];
  topK: number;
  gather: QueryGatherEntry[];
  merged: ScoredDoc[];
}

export interface SearchIndexClusterState {
  clusterId: string;
  tick: number;
  rngState?: number;
  analyzer: SearchAnalyzerConfig;
  documents: Record<string, SearchDocument>;
  docOrder: string[];
  /** term -> posting list sorted by docId (SEARCH-1 bidirectional mirror) */
  invertedIndex: Record<string, PostingEntry[]>;
  shards: Record<string, SearchShard>;
  shardOrder: string[];
  bm25: { k1: number; b: number };
  lastQuery: SearchQueryState | null;
  /** SEARCH-4: replicas reflect a primary write within this bound */
  propagationBoundTicks: number;
  stats: {
    docCount: number;
    ingestCount: number;
    deleteCount: number;
    queryCount: number;
    droppedShardDetected: number;
  };
}

export type SearchIndexSimEvent =
  | { id: string; tick: number; type: 'SEARCH_TICK'; payload: Record<string, unknown> }
  | { id: string; tick: number; type: 'SEARCH_INGEST'; payload: { docs: Array<{ id: string; text: string }> } }
  | { id: string; tick: number; type: 'SEARCH_DELETE_DOC'; payload: { docId: string } }
  | { id: string; tick: number; type: 'SEARCH_QUERY'; payload: { text: string; topK?: number } }
  | { id: string; tick: number; type: 'SEARCH_SET_BM25'; payload: { k1?: number; b?: number } }
  | {
      id: string;
      tick: number;
      type: 'SEARCH_SET_ANALYZER';
      payload: { tokenizer?: SearchTokenizer; stopwordRemoval?: boolean };
    }
  | { id: string; tick: number; type: 'SEARCH_KILL_PRIMARY'; payload: { shardId: string } }
  | { id: string; tick: number; type: 'SEARCH_REVIVE_PRIMARY'; payload: { shardId: string } };

/** Resource caps (hard-clamped; surfaced in UI when hit). */
export const SEARCH_CAPS = {
  maxDocuments: 500,
  maxTokensPerDoc: 256,
  maxShards: 8,
  maxReplicasPerShard: 2,
  maxTopK: 20,
  maxIngestBatch: 100,
  maxQueryTerms: 16,
} as const;

export const SEARCH_STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'of', 'and', 'to', 'in', 'on', 'for', 'it',
]);
