import type { DeterministicRNG } from '../../prng/deterministic-rng.js';
import {
  analyze,
  buildDocument,
  gatherFromShard,
  mergeGatherResults,
  shardForDoc,
  shardServing,
} from './search-index-algorithms.js';
import {
  SEARCH_CAPS,
  type QueryGatherEntry,
  type SearchIndexClusterState,
  type SearchIndexSimEvent,
  type SearchShard,
} from './search-index-types.js';

const DEFAULT_SHARDS = ['shard-1', 'shard-2', 'shard-3'];
const PROPAGATION_BOUND = 3;

function createShard(id: string): SearchShard {
  return {
    id,
    docIds: [],
    primaryOnline: true,
    replicas: [
      { id: `${id}-replica-a`, online: true, indexedDocIds: [] },
      { id: `${id}-replica-b`, online: true, indexedDocIds: [] },
    ],
    pendingSync: {},
    lastSyncTick: 0,
  };
}

export function createDefaultSearchIndexCluster(
  clusterId = 'search-index-1',
): SearchIndexClusterState {
  return {
    clusterId,
    tick: 0,
    analyzer: { tokenizer: 'STANDARD', stopwordRemoval: true },
    documents: {},
    docOrder: [],
    invertedIndex: {},
    shards: Object.fromEntries(DEFAULT_SHARDS.map((id) => [id, createShard(id)])),
    shardOrder: [...DEFAULT_SHARDS],
    bm25: { k1: 1.2, b: 0.75 },
    lastQuery: null,
    propagationBoundTicks: PROPAGATION_BOUND,
    stats: { docCount: 0, ingestCount: 0, deleteCount: 0, queryCount: 0, droppedShardDetected: 0 },
  };
}

/** Rebuild the inverted index from the document store (SEARCH-1 mirror). */
function rebuildInvertedIndex(state: SearchIndexClusterState): void {
  const index: Record<string, Array<{ docId: string; tf: number; positions: number[] }>> = {};
  for (const docId of state.docOrder) {
    const doc = state.documents[docId];
    if (!doc) continue;
    for (const term of Object.keys(doc.termFreqs)) {
      const positions: number[] = [];
      doc.tokens.forEach((token, i) => {
        if (token === term) positions.push(i);
      });
      if (!index[term]) index[term] = [];
      index[term]!.push({ docId, tf: doc.termFreqs[term] as number, positions });
    }
  }
  for (const term of Object.keys(index)) {
    (index[term] as Array<{ docId: string }>).sort((a, b) => a.docId.localeCompare(b.docId));
  }
  state.invertedIndex = index;
}

function syncReplicas(state: SearchIndexClusterState): void {
  for (const shard of Object.values(state.shards)) {
    const synced: string[] = [];
    for (const [docId, ingestTick] of Object.entries(shard.pendingSync)) {
      if (state.tick - ingestTick >= state.propagationBoundTicks) {
        synced.push(docId);
      }
    }
    if (synced.length > 0) {
      for (const replica of shard.replicas) {
        if (replica.online) {
          for (const docId of synced) {
            if (!replica.indexedDocIds.includes(docId)) {
              replica.indexedDocIds.push(docId);
            }
          }
        }
      }
      for (const docId of synced) {
        delete shard.pendingSync[docId];
      }
      shard.lastSyncTick = state.tick;
    }
  }
}

export function pureSearchIndexTransition(
  state: SearchIndexClusterState,
  event: SearchIndexSimEvent,
  rng: DeterministicRNG,
): { nextState: SearchIndexClusterState; emittedEvents: SearchIndexSimEvent[] } {
  const nextState: SearchIndexClusterState = JSON.parse(
    JSON.stringify(state),
  ) as SearchIndexClusterState;
  nextState.tick = event.tick;

  switch (event.type) {
    case 'SEARCH_INGEST': {
      for (const doc of event.payload.docs.slice(0, SEARCH_CAPS.maxIngestBatch)) {
        if (Object.keys(nextState.documents).length >= SEARCH_CAPS.maxDocuments) break;
        if (nextState.documents[doc.id] !== undefined) continue; // idempotent ingest

        const built = buildDocument(doc.id, doc.text, nextState.analyzer);
        if (built.length > SEARCH_CAPS.maxTokensPerDoc) {
          built.tokens = built.tokens.slice(0, SEARCH_CAPS.maxTokensPerDoc);
          const tfs: Record<string, number> = {};
          for (const t of built.tokens) {
            tfs[t] = (tfs[t] ?? 0) + 1;
          }
          built.termFreqs = tfs;
          built.length = built.tokens.length;
        }
        nextState.documents[doc.id] = built;
        nextState.docOrder.push(doc.id);
        nextState.stats.docCount++;
        nextState.stats.ingestCount++;

        const shardId = shardForDoc(doc.id, nextState.shardOrder);
        const shard = nextState.shards[shardId] as SearchShard;
        shard.docIds.push(doc.id);
        // Primary indexed immediately; replicas within the bound (SEARCH-4).
        shard.pendingSync[doc.id] = event.tick;
      }
      rebuildInvertedIndex(nextState);
      // Analyzer or corpus change invalidates cached query results.
      nextState.lastQuery = null;
      break;
    }

    case 'SEARCH_DELETE_DOC': {
      const docId = event.payload.docId;
      if (nextState.documents[docId] === undefined) break;
      delete nextState.documents[docId];
      nextState.docOrder = nextState.docOrder.filter((id) => id !== docId);
      nextState.stats.docCount--;
      nextState.stats.deleteCount++;
      for (const shard of Object.values(nextState.shards)) {
        shard.docIds = shard.docIds.filter((id) => id !== docId);
        delete shard.pendingSync[docId];
        for (const replica of shard.replicas) {
          replica.indexedDocIds = replica.indexedDocIds.filter((id) => id !== docId);
        }
      }
      // Full posting-list cleanup: every posting list drops the docId
      // (SEARCH-1 after deletion — no drift between stores).
      rebuildInvertedIndex(nextState);
      nextState.lastQuery = null;
      break;
    }

    case 'SEARCH_QUERY': {
      const terms = analyze(event.payload.text, nextState.analyzer).slice(0, SEARCH_CAPS.maxQueryTerms);
      const topK = Math.max(1, Math.min(SEARCH_CAPS.maxTopK, event.payload.topK ?? 10));

      const gather: QueryGatherEntry[] = [];
      const shardResults = [];
      for (const shardId of nextState.shardOrder) {
        const shard = nextState.shards[shardId] as SearchShard;
        const serving = shardServing(shard);
        if (serving.canServe) {
          const result = gatherFromShard(
            shard,
            serving.servedBy,
            terms,
            topK,
            nextState.documents,
            nextState.bm25,
          );
          shardResults.push(result);
          gather.push({
            shardId,
            participated: true,
            servedBy: serving.servedBy,
            topK: result.topK,
          });
        } else {
          shardResults.push({ shardId, servedBy: 'none', participated: false, topK: [], scored: [] });
          gather.push({ shardId, participated: false, servedBy: 'none', topK: [] });
          nextState.stats.droppedShardDetected++;
        }
      }
      const merged = mergeGatherResults(shardResults, topK);
      nextState.lastQuery = {
        id: `q-${nextState.stats.queryCount + 1}`,
        text: event.payload.text,
        terms,
        topK,
        gather,
        merged,
      };
      nextState.stats.queryCount++;
      break;
    }

    case 'SEARCH_SET_BM25': {
      if (event.payload.k1 !== undefined) {
        nextState.bm25.k1 = Math.max(0, Math.min(10, event.payload.k1));
      }
      if (event.payload.b !== undefined) {
        nextState.bm25.b = Math.max(0, Math.min(1, event.payload.b));
      }
      break;
    }

    case 'SEARCH_SET_ANALYZER': {
      if (event.payload.tokenizer !== undefined) {
        nextState.analyzer.tokenizer = event.payload.tokenizer;
      }
      if (event.payload.stopwordRemoval !== undefined) {
        nextState.analyzer.stopwordRemoval = event.payload.stopwordRemoval;
      }
      // Re-analyze the whole corpus under the new analyzer.
      for (const docId of nextState.docOrder) {
        const doc = nextState.documents[docId] as { rawText: string };
        nextState.documents[docId] = buildDocument(docId, doc.rawText, nextState.analyzer);
      }
      rebuildInvertedIndex(nextState);
      nextState.lastQuery = null;
      break;
    }

    case 'SEARCH_KILL_PRIMARY': {
      const shard = nextState.shards[event.payload.shardId];
      if (shard) {
        shard.primaryOnline = false;
      }
      break;
    }

    case 'SEARCH_REVIVE_PRIMARY': {
      const shard = nextState.shards[event.payload.shardId];
      if (shard) {
        shard.primaryOnline = true;
      }
      break;
    }

    case 'TICK' as any:
    case 'SEARCH_TICK': {
      syncReplicas(nextState);
      break;
    }
  }

  nextState.rngState = rng.getState();
  return { nextState, emittedEvents: [] };
}
