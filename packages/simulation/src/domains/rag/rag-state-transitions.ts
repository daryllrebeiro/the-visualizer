/**
 * RAG State Transitions & Simulation Reducer
 */

import type { DeterministicRNG } from '../../prng/deterministic-rng.js';
import {
  calculateRRF,
  computeBM25Score,
  cosineSimilarity,
  crossEncoderRerank,
  lostInTheMiddleReorder,
} from './rag-algorithms.js';
import type {
  PackedChunk,
  RAGChunk,
  RAGClusterState,
  RAGDocument,
  RAGSimEvent,
  RetrievalMatch,
} from './rag-types.js';

export function createDefaultRAGCluster(clusterId = 'rag-1'): RAGClusterState {
  const doc1: RAGDocument = {
    id: 'doc-raft',
    title: 'Raft Consensus Protocol Guide',
    content:
      'Raft is a consensus algorithm designed as an alternative to Paxos. It uses leader election, log replication, and safety invariants to ensure linearizability across a distributed state machine.',
    chunkStrategy: 'FIXED_SIZE',
    status: 'INDEXED',
  };

  const doc2: RAGDocument = {
    id: 'doc-kafka',
    title: 'Kafka Architecture & ISR Replication',
    content:
      'Apache Kafka uses partitioned append-only commit logs. Replicas maintain an In-Sync Replicas (ISR) set. High Watermark advances only when all ISR members acknowledge writes.',
    chunkStrategy: 'FIXED_SIZE',
    status: 'INDEXED',
  };

  const doc3: RAGDocument = {
    id: 'doc-dynamo',
    title: 'Dynamo Consistent Hash Rings',
    content:
      'Amazon Dynamo partitions keys across a 360-degree hash ring using virtual nodes (vnodes). Tunable PACELC consistency allows configuring R + W > N quorum trade-offs.',
    chunkStrategy: 'FIXED_SIZE',
    status: 'INDEXED',
  };

  const chunks: Record<string, RAGChunk> = {
    'chunk-raft-1': {
      id: 'chunk-raft-1',
      docId: 'doc-raft',
      content: 'Raft consensus uses leader election and log replication for state machine safety.',
      tokenCount: 64,
      denseVector: [0.85, 0.25, 0.45, 0.1, 0.9, 0.3, 0.15, 0.75],
      sparseTerms: { raft: 3, consensus: 2, leader: 2, election: 1, replication: 1 },
    },
    'chunk-raft-2': {
      id: 'chunk-raft-2',
      docId: 'doc-raft',
      content:
        'Heartbeat intervals and election timeouts prevent split-brain elections in Raft clusters.',
      tokenCount: 72,
      denseVector: [0.8, 0.3, 0.4, 0.15, 0.85, 0.35, 0.1, 0.7],
      sparseTerms: { heartbeat: 2, timeout: 2, election: 1, splitbrain: 1, raft: 1 },
    },
    'chunk-kafka-1': {
      id: 'chunk-kafka-1',
      docId: 'doc-kafka',
      content:
        'Kafka partition leaders replicate log segments to In-Sync Replicas before committing.',
      tokenCount: 68,
      denseVector: [0.2, 0.9, 0.3, 0.8, 0.25, 0.85, 0.4, 0.3],
      sparseTerms: { kafka: 3, partition: 2, leader: 1, isr: 2, replication: 2 },
    },
    'chunk-dynamo-1': {
      id: 'chunk-dynamo-1',
      docId: 'doc-dynamo',
      content:
        'Consistent hashing with 256 vnodes ensures balanced token distribution and smooth scale-out.',
      tokenCount: 80,
      denseVector: [0.15, 0.35, 0.9, 0.2, 0.3, 0.2, 0.85, 0.4],
      sparseTerms: { dynamo: 2, hash: 3, vnodes: 2, token: 2, scaleout: 1 },
    },
  };

  return {
    clusterId,
    tick: 0,
    documents: {
      'doc-raft': doc1,
      'doc-kafka': doc2,
      'doc-dynamo': doc3,
    },
    chunks,
    retrievalPipeline: {
      denseTopK: 3,
      sparseTopK: 3,
      rrfK: 60,
      denseWeight: 0.5,
      sparseWeight: 0.5,
      rerankTopN: 2,
    },
    contextWindow: {
      maxBudgetTokens: 1024,
      systemPromptTokens: 128,
      queryTokens: 32,
      packedChunks: [],
      lostInTheMiddleReordered: true,
    },
    evaluations: {
      groundednessScore: 1.0,
      contextRelevanceScore: 1.0,
      citationPrecision: 1.0,
      hallucinationRisk: 'LOW',
    },
    activeQuery: null,
    metrics: {
      totalQueries: 0,
      avgRetrievalLatencyMs: 24,
      cacheHitRatio: 0.85,
    },
  };
}

export function pureRAGTransition(
  state: RAGClusterState,
  event: RAGSimEvent,
  rng: DeterministicRNG,
): { nextState: RAGClusterState; emittedEvents: RAGSimEvent[] } {
  const nextState: RAGClusterState = JSON.parse(JSON.stringify(state)) as RAGClusterState;
  nextState.tick = event.tick;

  switch (event.type) {
    case 'TICK' as any:
    case 'RAG_TICK': {
      // Background metric oscillations
      nextState.metrics.avgRetrievalLatencyMs = 20 + Math.floor(rng.nextFloat() * 10);
      break;
    }

    case 'RAG_INGEST_DOC': {
      const { docId, title, content, chunkStrategy = 'FIXED_SIZE' } = event.payload;
      nextState.documents[docId] = {
        id: docId,
        title,
        content,
        chunkStrategy,
        status: 'INDEXED',
      };

      // Generate synthetic chunks
      const chunkId = `chunk-${docId}-1`;
      const denseVector = Array.from({ length: 8 }, () => Number(rng.nextFloat().toFixed(3)));
      const words = content.toLowerCase().split(/\s+/);
      const sparseTerms: Record<string, number> = {};
      for (const w of words) {
        if (w.length > 3) sparseTerms[w] = (sparseTerms[w] ?? 0) + 1;
      }

      nextState.chunks[chunkId] = {
        id: chunkId,
        docId,
        content: content.slice(0, 200),
        tokenCount: Math.min(128, Math.max(32, words.length)),
        denseVector,
        sparseTerms,
      };
      break;
    }

    case 'RAG_EXECUTE_QUERY': {
      const { queryId, text, denseVector } = event.payload;
      nextState.metrics.totalQueries++;
      const queryVec =
        denseVector ?? Array.from({ length: 8 }, () => Number(rng.nextFloat().toFixed(3)));
      const queryTokens = text
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t.length > 2);

      const allChunks = Object.values(nextState.chunks);

      // 1. Dense Cosine Retrieval
      const denseMatches: RetrievalMatch[] = allChunks
        .map((chunk) => ({
          chunkId: chunk.id,
          score: cosineSimilarity(queryVec, chunk.denseVector),
          rank: 0,
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, nextState.retrievalPipeline.denseTopK);
      denseMatches.forEach((m, idx) => {
        m.rank = idx + 1;
      });

      // 2. Sparse BM25 Retrieval
      const sparseMatches: RetrievalMatch[] = allChunks
        .map((chunk) => ({
          chunkId: chunk.id,
          score: computeBM25Score(queryTokens, chunk.sparseTerms, chunk.tokenCount),
          rank: 0,
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, nextState.retrievalPipeline.sparseTopK);
      sparseMatches.forEach((m, idx) => {
        m.rank = idx + 1;
      });

      // 3. Reciprocal Rank Fusion (RRF)
      const fusedMatches = calculateRRF(
        denseMatches,
        sparseMatches,
        nextState.retrievalPipeline.rrfK,
        nextState.retrievalPipeline.denseWeight,
        nextState.retrievalPipeline.sparseWeight,
      );

      // 4. Initial Cross-Encoder Re-Ranking
      const candidateChunks = fusedMatches
        .map((m) => nextState.chunks[m.chunkId])
        .filter((c): c is RAGChunk => c !== undefined);

      const rerankedMatches = crossEncoderRerank(
        queryVec,
        candidateChunks,
        nextState.retrievalPipeline.rerankTopN,
      );

      nextState.activeQuery = {
        queryId,
        text,
        denseVector: queryVec,
        denseMatches,
        sparseMatches,
        fusedMatches,
        rerankedMatches,
      };

      // Automatically pack context
      const packed: PackedChunk[] = [];
      let currentTokens =
        nextState.contextWindow.systemPromptTokens + nextState.contextWindow.queryTokens;

      for (let i = 0; i < rerankedMatches.length; i++) {
        const m = rerankedMatches[i];
        if (!m) continue;
        const chunk = nextState.chunks[m.chunkId];
        if (!chunk) continue;
        if (currentTokens + chunk.tokenCount <= nextState.contextWindow.maxBudgetTokens) {
          packed.push({
            chunkId: chunk.id,
            docId: chunk.docId,
            position: i + 1,
            tokens: chunk.tokenCount,
            rerankScore: m.score,
          });
          currentTokens += chunk.tokenCount;
        }
      }

      nextState.contextWindow.packedChunks = nextState.contextWindow.lostInTheMiddleReordered
        ? lostInTheMiddleReorder(packed)
        : packed;

      break;
    }

    case 'RAG_RERANK_CHUNKS': {
      if (nextState.activeQuery) {
        const topN = event.payload.rerankTopN ?? nextState.retrievalPipeline.rerankTopN;
        const candidateChunks = nextState.activeQuery.fusedMatches
          .map((m) => nextState.chunks[m.chunkId])
          .filter((c): c is RAGChunk => c !== undefined);

        nextState.activeQuery.rerankedMatches = crossEncoderRerank(
          nextState.activeQuery.denseVector,
          candidateChunks,
          topN,
        );
      }
      break;
    }

    case 'RAG_PACK_CONTEXT': {
      if (event.payload.maxBudgetTokens) {
        nextState.contextWindow.maxBudgetTokens = event.payload.maxBudgetTokens;
      }
      if (event.payload.enableLostInTheMiddle !== undefined) {
        nextState.contextWindow.lostInTheMiddleReordered = event.payload.enableLostInTheMiddle;
      }
      if (nextState.activeQuery) {
        const packed: PackedChunk[] = [];
        let currentTokens =
          nextState.contextWindow.systemPromptTokens + nextState.contextWindow.queryTokens;

        for (let i = 0; i < nextState.activeQuery.rerankedMatches.length; i++) {
          const m = nextState.activeQuery.rerankedMatches[i];
          if (!m) continue;
          const chunk = nextState.chunks[m.chunkId];
          if (!chunk) continue;
          if (currentTokens + chunk.tokenCount <= nextState.contextWindow.maxBudgetTokens) {
            packed.push({
              chunkId: chunk.id,
              docId: chunk.docId,
              position: i + 1,
              tokens: chunk.tokenCount,
              rerankScore: m.score,
            });
            currentTokens += chunk.tokenCount;
          }
        }

        nextState.contextWindow.packedChunks = nextState.contextWindow.lostInTheMiddleReordered
          ? lostInTheMiddleReorder(packed)
          : packed;
      }
      break;
    }

    case 'RAG_SYNTHESIZE_RESPONSE': {
      if (nextState.activeQuery) {
        const citations = nextState.contextWindow.packedChunks.map((c) => c.chunkId);
        nextState.activeQuery.response = `Synthesized response grounded in ${String(citations.length)} retrieved passages.`;
        nextState.activeQuery.citations = citations;
        nextState.evaluations.groundednessScore = 0.96;
        nextState.evaluations.contextRelevanceScore = 0.94;
        nextState.evaluations.citationPrecision = 1.0;
        nextState.evaluations.hallucinationRisk = 'LOW';
      }
      break;
    }

    case 'RAG_INJECT_OUT_OF_DOMAIN': {
      // Adversarial test: query about unrelated topic
      const queryId = `query-adversarial-${String(nextState.tick)}`;
      const queryVec = Array.from({ length: 8 }, () => 0.05); // Low similarity vector
      const text = event.payload.queryText;

      const allChunks = Object.values(nextState.chunks);
      const denseMatches: RetrievalMatch[] = allChunks
        .map((chunk) => ({
          chunkId: chunk.id,
          score: cosineSimilarity(queryVec, chunk.denseVector),
          rank: 0,
        }))
        .slice(0, 2);
      denseMatches.forEach((m, idx) => {
        m.rank = idx + 1;
      });

      nextState.activeQuery = {
        queryId,
        text,
        denseVector: queryVec,
        denseMatches,
        sparseMatches: [],
        fusedMatches: denseMatches.map((m) => ({
          chunkId: m.chunkId,
          rrfScore: 0.005,
          rank: m.rank,
        })),
        rerankedMatches: denseMatches,
        response: 'Hallucination warning: Out of domain query cannot be reliably grounded.',
        citations: [],
      };

      nextState.evaluations.groundednessScore = 0.22;
      nextState.evaluations.contextRelevanceScore = 0.18;
      nextState.evaluations.hallucinationRisk = 'HIGH';
      break;
    }

    case 'RAG_MUTATE_CHUNK_CONFIG': {
      if (event.payload.chunkSizeTokens) {
        // Resize all existing chunk token counts
        for (const chunk of Object.values(nextState.chunks)) {
          chunk.tokenCount = event.payload.chunkSizeTokens;
        }
      }
      break;
    }
  }

  (nextState as any).rngState = rng.getState();
  return { nextState, emittedEvents: [] };
}
