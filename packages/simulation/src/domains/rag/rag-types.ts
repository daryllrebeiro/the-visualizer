/**
 * Retrieval-Augmented Generation (RAG) Simulation Types & State Model
 *
 * References:
 * - Gao et al. (2023): Modular RAG Architecture
 * - Karpukhin et al. (2020): Dense Passage Retrieval (DPR)
 * - Cormack et al. (2009): Reciprocal Rank Fusion (RRF)
 * - Liu et al. (2023): Lost in the Middle: How Language Models Use Long Contexts
 */

export interface RAGDocument {
  id: string;
  title: string;
  content: string;
  chunkStrategy: 'FIXED_SIZE' | 'SENTENCE_WINDOW' | 'HIERARCHICAL';
  status: 'RAW' | 'CHUNKED' | 'INDEXED';
}

export interface RAGChunk {
  id: string;
  docId: string;
  content: string;
  tokenCount: number;
  denseVector: number[];
  sparseTerms: Record<string, number>;
}

export interface RetrievalConfig {
  denseTopK: number;
  sparseTopK: number;
  rrfK: number;
  denseWeight: number;
  sparseWeight: number;
  rerankTopN: number;
}

export interface PackedChunk {
  chunkId: string;
  docId: string;
  position: number;
  tokens: number;
  rerankScore: number;
}

export interface RAGContextWindow {
  maxBudgetTokens: number;
  systemPromptTokens: number;
  queryTokens: number;
  packedChunks: PackedChunk[];
  lostInTheMiddleReordered: boolean;
}

export interface RAGEvaluations {
  groundednessScore: number;
  contextRelevanceScore: number;
  citationPrecision: number;
  hallucinationRisk: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface RetrievalMatch {
  chunkId: string;
  score: number;
  rank: number;
}

export interface RRFMatch {
  chunkId: string;
  rrfScore: number;
  rank: number;
}

export interface RAGActiveQuery {
  queryId: string;
  text: string;
  denseVector: number[];
  denseMatches: RetrievalMatch[];
  sparseMatches: RetrievalMatch[];
  fusedMatches: RRFMatch[];
  rerankedMatches: RetrievalMatch[];
  response?: string | undefined;
  citations?: string[] | undefined;
}

export interface RAGClusterState {
  clusterId: string;
  tick: number;
  documents: Record<string, RAGDocument>;
  chunks: Record<string, RAGChunk>;
  retrievalPipeline: RetrievalConfig;
  contextWindow: RAGContextWindow;
  evaluations: RAGEvaluations;
  activeQuery: RAGActiveQuery | null;
  metrics: {
    totalQueries: number;
    avgRetrievalLatencyMs: number;
    cacheHitRatio: number;
  };
}

export type RAGSimEvent =
  | { id: string; tick: number; type: 'RAG_TICK'; payload: Record<string, unknown> }
  | {
      id: string;
      tick: number;
      type: 'RAG_INGEST_DOC';
      payload: {
        docId: string;
        title: string;
        content: string;
        chunkStrategy?: 'FIXED_SIZE' | 'SENTENCE_WINDOW' | 'HIERARCHICAL' | undefined;
      };
    }
  | {
      id: string;
      tick: number;
      type: 'RAG_EXECUTE_QUERY';
      payload: {
        queryId: string;
        text: string;
        denseVector?: number[] | undefined;
      };
    }
  | {
      id: string;
      tick: number;
      type: 'RAG_RERANK_CHUNKS';
      payload: {
        queryId: string;
        rerankTopN?: number | undefined;
      };
    }
  | {
      id: string;
      tick: number;
      type: 'RAG_PACK_CONTEXT';
      payload: {
        maxBudgetTokens?: number | undefined;
        enableLostInTheMiddle?: boolean | undefined;
      };
    }
  | {
      id: string;
      tick: number;
      type: 'RAG_SYNTHESIZE_RESPONSE';
      payload: {
        queryId: string;
      };
    }
  | {
      id: string;
      tick: number;
      type: 'RAG_INJECT_OUT_OF_DOMAIN';
      payload: {
        queryText: string;
      };
    }
  | {
      id: string;
      tick: number;
      type: 'RAG_MUTATE_CHUNK_CONFIG';
      payload: {
        chunkSizeTokens?: number | undefined;
      };
    };
