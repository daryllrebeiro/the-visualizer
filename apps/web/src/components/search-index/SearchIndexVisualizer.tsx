'use client';

import React, { useState } from 'react';

import type { SearchIndexClusterState, SearchIndexSimEvent } from '@the-visualizer/simulation';
import { Badge, ControlButton, DataTable, Panel, StatRow } from '../new-domains/shared';

export interface SearchIndexVisualizerProps {
  state: SearchIndexClusterState;
  dispatch: (event: SearchIndexSimEvent) => void;
}

const SEED_DOCS = [
  'the distributed systems book covers consensus replication and quorum reads',
  'search engines tokenize documents into inverted index posting lists',
  'bm25 scores documents by term frequency saturation and length normalization',
  'scatter gather fans a query out across shards and merges ranked results',
  'replica shards serve queries when a primary fails over',
];

export function SearchIndexVisualizer({ state, dispatch }: SearchIndexVisualizerProps): React.JSX.Element {
  const [query, setQuery] = useState('distributed consensus');
  const [newDoc, setNewDoc] = useState('');
  const ev = (type: SearchIndexSimEvent['type'], payload: Record<string, unknown>): void => {
    dispatch({ id: `si-${Math.random().toString(36).slice(2, 8)}`, tick: state.tick + 1, type, payload } as SearchIndexSimEvent);
  };

  const terms = Object.keys(state.invertedIndex).sort();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <Panel
        title="Distributed Search — Inverted Index & BM25"
        subtitle={`analyzer ${state.analyzer.tokenizer}${state.analyzer.stopwordRemoval ? ' + stopwords' : ''} · k1=${state.bm25.k1} b=${state.bm25.b} · ${state.stats.docCount} docs`}
        accent="#f59e0b"
        right={
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <ControlButton label="Tick (replica sync)" onClick={() => ev('SEARCH_TICK', {})} />
          </div>
        }
      >
        <StatRow
          items={[
            { label: 'Documents', value: String(state.stats.docCount) },
            { label: 'Distinct terms', value: String(terms.length) },
            { label: 'Queries', value: String(state.stats.queryCount) },
            { label: 'Replica sync bound', value: `${state.propagationBoundTicks}t` },
          ]}
        />
      </Panel>

      <Panel title="Ingest documents" accent="#10b981">
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <input
            value={newDoc}
            onChange={(e) => setNewDoc(e.target.value)}
            placeholder="type document text…"
            style={{
              flex: 1,
              minWidth: '200px',
              backgroundColor: '#020617',
              border: '1px solid #334155',
              borderRadius: '6px',
              padding: '6px 10px',
              color: '#e2e8f0',
              fontSize: '0.8rem',
            }}
          />
          <ControlButton
            label="Ingest"
            tone="success"
            disabled={newDoc.trim().length === 0}
            onClick={() => {
              ev('SEARCH_INGEST', { docs: [{ id: `doc-${state.stats.docCount + 1}`, text: newDoc.trim() }] });
              setNewDoc('');
            }}
          />
          <ControlButton
            label="Seed 5 docs"
            onClick={() =>
              ev('SEARCH_INGEST', {
                docs: SEED_DOCS.map((text, i) => ({ id: `seed-${state.stats.ingestCount}-${i}`, text })),
              })
            }
          />
        </div>
      </Panel>

      <Panel title="Analyzer mode (re-analyzes the whole corpus)" accent="#8b5cf6">
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <ControlButton label="STANDARD" tone={state.analyzer.tokenizer === 'STANDARD' ? 'success' : 'default'} onClick={() => ev('SEARCH_SET_ANALYZER', { tokenizer: 'STANDARD' })} />
          <ControlButton label="SIMPLE (whitespace)" tone={state.analyzer.tokenizer === 'SIMPLE' ? 'success' : 'default'} onClick={() => ev('SEARCH_SET_ANALYZER', { tokenizer: 'SIMPLE' })} />
          <ControlButton label="KEYWORD" tone={state.analyzer.tokenizer === 'KEYWORD' ? 'success' : 'default'} onClick={() => ev('SEARCH_SET_ANALYZER', { tokenizer: 'KEYWORD' })} />
          <ControlButton
            label={state.analyzer.stopwordRemoval ? 'Stopwords: ON' : 'Stopwords: OFF'}
            tone={state.analyzer.stopwordRemoval ? 'success' : 'warn'}
            onClick={() => ev('SEARCH_SET_ANALYZER', { stopwordRemoval: !state.analyzer.stopwordRemoval })}
          />
        </div>
      </Panel>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <Panel title="Inverted index (term → posting list)" accent="#38bdf8">
          <DataTable
            headers={['term', 'df', 'postings (doc:tf)']}
            rows={terms.slice(0, 60).map((term) => [
              <code key="t" style={{ color: '#38bdf8' }}>{term}</code>,
              String(state.invertedIndex[term]!.length),
              state.invertedIndex[term]!
                .map((p) => `${p.docId}:${p.tf}`)
                .join(', '),
            ])}
            maxHeight="260px"
          />
        </Panel>

        <Panel title="Shards & replicas" accent="#ef4444">
          <DataTable
            headers={['shard', 'docs', 'primary', 'replica A', 'replica B']}
            rows={state.shardOrder.map((id) => {
              const shard = state.shards[id]!;
              return [
                id,
                String(shard.docIds.length),
                <Badge key="p" text={shard.primaryOnline ? 'ONLINE' : 'DOWN'} color={shard.primaryOnline ? '#10b981' : '#ef4444'} />,
                <span key="a" style={{ color: shard.replicas[0]!.online ? '#10b981' : '#ef4444' }}>
                  {shard.replicas[0]!.indexedDocIds.length} docs
                </span>,
                <span key="b" style={{ color: shard.replicas[1]!.online ? '#10b981' : '#ef4444' }}>
                  {shard.replicas[1]!.indexedDocIds.length} docs
                </span>,
              ];
            })}
          />
          <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
            {state.shardOrder.map((id) => (
              <ControlButton
                key={id}
                label={`💥 Kill ${id} primary`}
                tone="danger"
                disabled={!state.shards[id]!.primaryOnline}
                onClick={() => ev('SEARCH_KILL_PRIMARY', { shardId: id })}
              />
            ))}
          </div>
          <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
            {state.shardOrder.map((id) => (
              <ControlButton
                key={id}
                label={`💚 Revive ${id}`}
                tone="success"
                disabled={state.shards[id]!.primaryOnline}
                onClick={() => ev('SEARCH_REVIVE_PRIMARY', { shardId: id })}
              />
            ))}
          </div>
        </Panel>
      </div>

      <Panel
        title="Query — scatter-gather + BM25 score breakdown (flagship arithmetic)"
        accent="#f59e0b"
      >
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              flex: 1,
              minWidth: '200px',
              backgroundColor: '#020617',
              border: '1px solid #334155',
              borderRadius: '6px',
              padding: '6px 10px',
              color: '#e2e8f0',
              fontSize: '0.8rem',
            }}
          />
          <ControlButton label="🔍 Search" tone="success" onClick={() => ev('SEARCH_QUERY', { text: query, topK: 10 })} />
          <span style={{ fontSize: '0.75rem', color: '#94a3b8', alignSelf: 'center' }}>
            k1: <button style={{ color: '#38bdf8', background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => ev('SEARCH_SET_BM25', { k1: Math.max(0, state.bm25.k1 - 0.2) })}>−</button>{' '}
            <strong>{state.bm25.k1.toFixed(1)}</strong>{' '}
            <button style={{ color: '#38bdf8', background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => ev('SEARCH_SET_BM25', { k1: Math.min(10, state.bm25.k1 + 0.2) })}>+</button>{' '}
            · b: <button style={{ color: '#38bdf8', background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => ev('SEARCH_SET_BM25', { b: Math.max(0, state.bm25.b - 0.1) })}>−</button>{' '}
            <strong>{state.bm25.b.toFixed(2)}</strong>{' '}
            <button style={{ color: '#38bdf8', background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => ev('SEARCH_SET_BM25', { b: Math.min(1, state.bm25.b + 0.1) })}>+</button>
          </span>
        </div>
        {state.lastQuery === null ? (
          <div style={{ color: '#475569', fontSize: '0.8rem' }}>Run a query to see per-shard gather and the BM25 arithmetic.</div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
              {state.lastQuery.gather.map((g) => (
                <Badge
                  key={g.shardId}
                  text={`${g.shardId} → ${g.participated ? g.servedBy : 'DROPPED'} (${g.topK.length})`}
                  color={g.participated ? '#10b981' : '#ef4444'}
                />
              ))}
            </div>
            <DataTable
              headers={['rank', 'doc', 'shard', 'score', 'per-term contribution (idf × tf-part)']}
              rows={state.lastQuery.merged.map((m, i) => [
                String(i + 1),
                <code key="d" style={{ color: '#f8fafc' }}>{m.docId}</code>,
                m.shardId,
                <strong key="s" style={{ color: '#f59e0b' }}>{m.score.toFixed(4)}</strong>,
                m.breakdown
                  .map((b) => `${b.term}: tf=${b.tf}, idf=${b.idf.toFixed(3)}, tf-part=${b.tfComponent.toFixed(3)} → ${b.contribution.toFixed(4)}`)
                  .join('  |  '),
              ])}
              maxHeight="220px"
            />
          </>
        )}
      </Panel>

      <Panel title="Documents" accent="#64748b">
        <DataTable
          headers={['doc', 'tokens', 'length', 'delete']}
          rows={state.docOrder.map((id) => {
            const doc = state.documents[id]!;
            return [
              <code key="i" style={{ color: '#94a3b8' }}>{id}</code>,
              doc.tokens.slice(0, 12).join(' ') + (doc.tokens.length > 12 ? '…' : ''),
              String(doc.length),
              <ControlButton key="x" label="🗑" tone="danger" onClick={() => ev('SEARCH_DELETE_DOC', { docId: id })} />,
            ];
          })}
          maxHeight="200px"
        />
      </Panel>
    </div>
  );
}
