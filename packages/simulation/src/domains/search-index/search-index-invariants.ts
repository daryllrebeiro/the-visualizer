import { shardStats } from './search-index-algorithms.js';
import {
  bm25FullScore,
  quantizeScore,
} from './bm25-score.js';
import type { SearchIndexClusterState } from './search-index-types.js';

export interface SearchIndexInvariantViolation {
  ruleId: 'SEARCH-1' | 'SEARCH-2' | 'SEARCH-3' | 'SEARCH-4';
  invariantName: string;
  description: string;
  affectedEntities: string[];
}

/**
 * State-level checks for the search-index domain.
 *
 * SEARCH-1: the inverted index must be the exact bidirectional mirror of
 * the forward document store (doc contains term <=> docId in postings).
 * SEARCH-2: the last query's merged scores must equal a full recomputation
 * from state statistics with the real BM25 formula.
 * SEARCH-3: every shard must have participated in the last query's
 * scatter-gather.
 * SEARCH-4: documents older than the propagation bound must be reflected
 * on all online replicas.
 */
export class SearchIndexInvariantChecker {
  public check(state: SearchIndexClusterState): SearchIndexInvariantViolation | undefined {
    // SEARCH-1: bidirectional posting-list completeness.
    // Forward direction: doc contains term => docId in postings(term).
    for (const docId of state.docOrder) {
      const doc = state.documents[docId];
      if (!doc) {
        return {
          ruleId: 'SEARCH-1',
          invariantName: 'Posting List Completeness',
          description: `Document ${docId} is in the document store order but missing from the store`,
          affectedEntities: [docId],
        };
      }
      for (const term of Object.keys(doc.termFreqs)) {
        const postings = state.invertedIndex[term];
        const entry = postings?.find((p) => p.docId === docId);
        if (!entry) {
          return {
            ruleId: 'SEARCH-1',
            invariantName: 'Posting List Completeness',
            description: `Document ${docId} contains term "${term}" (tf=${doc.termFreqs[term]}) but is missing from that term's posting list`,
            affectedEntities: [docId, term],
          };
        }
        if (entry.tf !== doc.termFreqs[term]) {
          return {
            ruleId: 'SEARCH-1',
            invariantName: 'Posting List Completeness',
            description: `Posting entry for ${docId}/"${term}" has tf=${entry.tf} but the document's term frequency is ${doc.termFreqs[term]}`,
            affectedEntities: [docId, term],
          };
        }
      }
    }
    // Reverse direction: docId in postings(term) => doc contains term.
    for (const [term, postings] of Object.entries(state.invertedIndex)) {
      for (const entry of postings) {
        const doc = state.documents[entry.docId];
        const tf = doc?.termFreqs[term] ?? 0;
        if (tf === 0) {
          return {
            ruleId: 'SEARCH-1',
            invariantName: 'Posting List Completeness',
            description: `Posting list for "${term}" references ${entry.docId} but that document does not contain the term (stale index after delete?)`,
            affectedEntities: [entry.docId, term],
          };
        }
      }
    }

    // SEARCH-2: full-formula parity on the last query.
    if (state.lastQuery) {
      const query = state.lastQuery;
      for (const shardId of state.shardOrder) {
        const shard = state.shards[shardId];
        if (!shard) continue;
        const stats = shardStats(shard, state.documents);
        for (const scored of query.merged) {
          if (scored.shardId !== shardId) continue;
          const doc = state.documents[scored.docId];
          if (!doc) {
            return {
              ruleId: 'SEARCH-2',
              invariantName: 'BM25 Score Parity',
              description: `Query result references missing document ${scored.docId}`,
              affectedEntities: [scored.docId],
            };
          }
          const { score } = bm25FullScore(
            query.terms,
            doc.termFreqs,
            doc.length,
            stats.avgDocLength,
            stats.docCount,
            stats.docFreqs,
            state.bm25.k1,
            state.bm25.b,
          );
          if (Math.abs(quantizeScore(score) - scored.score) > 1e-4) {
            return {
              ruleId: 'SEARCH-2',
              invariantName: 'BM25 Score Parity',
              description: `Scored doc ${scored.docId} has stored score ${scored.score} but full recomputation gives ${quantizeScore(score)}`,
              affectedEntities: [scored.docId, shardId],
            };
          }
        }
      }
      // Ranking must be non-increasing in score.
      for (let i = 1; i < query.merged.length; i++) {
        const prev = query.merged[i - 1] as { score: number };
        const curr = query.merged[i] as { score: number };
        if (curr.score > prev.score + 1e-9) {
          return {
            ruleId: 'SEARCH-2',
            invariantName: 'BM25 Ranking Order',
            description: `Merged results are not sorted by descending score (${prev.score} before ${curr.score})`,
            affectedEntities: [query.id],
          };
        }
      }
    }

    // SEARCH-3: every shard participated in the last scatter-gather.
    if (state.lastQuery) {
      for (const shardId of state.shardOrder) {
        const entry = state.lastQuery.gather.find((g) => g.shardId === shardId);
        if (!entry || !entry.participated) {
          return {
            ruleId: 'SEARCH-3',
            invariantName: 'Shard Coverage Completeness',
            description: `Shard ${shardId} did not participate in query ${state.lastQuery.id}'s scatter-gather — its results are silently dropped`,
            affectedEntities: [shardId, state.lastQuery.id],
          };
        }
      }
    }

    // SEARCH-4: bounded replica propagation.
    for (const shard of Object.values(state.shards)) {
      for (const docId of shard.docIds) {
        const pendingTick = shard.pendingSync[docId];
        if (pendingTick !== undefined && state.tick - pendingTick >= state.propagationBoundTicks) {
          return {
            ruleId: 'SEARCH-4',
            invariantName: 'Replica Consistency',
            description: `Document ${docId} was indexed on ${shard.id}'s primary ${state.tick - pendingTick} ticks ago, exceeding the propagation bound ${state.propagationBoundTicks}, but replicas still have not synced`,
            affectedEntities: [shard.id, docId],
          };
        }
      }
      for (const replica of shard.replicas) {
        if (replica.online) {
          for (const docId of replica.indexedDocIds) {
            if (!shard.docIds.includes(docId)) {
              return {
                ruleId: 'SEARCH-4',
                invariantName: 'Replica Consistency',
                description: `Replica ${replica.id} indexes document ${docId} that the primary no longer holds (deletion not propagated)`,
                affectedEntities: [replica.id, docId],
              };
            }
          }
        }
      }
    }

    return undefined;
  }
}
