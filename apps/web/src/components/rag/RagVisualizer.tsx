'use client';

import React, { useState } from 'react';

import type { RAGClusterState } from '@the-visualizer/simulation';

export interface RagVisualizerProps {
  state: RAGClusterState;
  onExecuteQuery?: (queryId: string, text: string) => void;
  onPackContext?: (maxBudgetTokens: number, enableLostInTheMiddle: boolean) => void;
  onSynthesize?: (queryId: string) => void;
  onInjectOutOfDomain?: (queryText: string) => void;
}

export function RagVisualizer({
  state,
  onExecuteQuery,
  onPackContext,
  onSynthesize,
  onInjectOutOfDomain,
}: RagVisualizerProps): React.JSX.Element {
  const [queryInput, setQueryInput] = useState('consensus Raft election log replication');
  const [lostInMiddle, setLostInMiddle] = useState(state.contextWindow.lostInTheMiddleReordered);

  const totalContextTokens =
    state.contextWindow.systemPromptTokens +
    state.contextWindow.queryTokens +
    state.contextWindow.packedChunks.reduce((acc: number, c: any) => acc + c.tokens, 0);
  const contextPct = Math.min(
    100,
    Math.round((totalContextTokens / state.contextWindow.maxBudgetTokens) * 100),
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '16px', gap: '16px', color: '#f8fafc' }}>
      {/* Top Banner & Evaluations */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: '#0f172a',
          padding: '12px 18px',
          borderRadius: '8px',
          border: '1px solid #1e293b',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '1.2rem' }}>📚</span>
            <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
              Retrieval-Augmented Generation (Modular RAG & RRF)
            </h2>
            <span style={{ backgroundColor: '#1e3a8a', color: '#93c5fd', fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px' }}>
              RFC / Gao et al.
            </span>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '2px' }}>
            Cluster: <code>{state.clusterId}</code> · Tick: <strong>{state.tick}</strong> · Documents: {Object.keys(state.documents).length} · Chunks: {Object.keys(state.chunks).length}
          </div>
        </div>

        {/* Quality Badges */}
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>Groundedness</div>
            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: state.evaluations.groundednessScore > 0.8 ? '#10b981' : '#ef4444' }}>
              {(state.evaluations.groundednessScore * 100).toFixed(0)}%
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>Relevance</div>
            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: state.evaluations.contextRelevanceScore > 0.8 ? '#38bdf8' : '#f59e0b' }}>
              {(state.evaluations.contextRelevanceScore * 100).toFixed(0)}%
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>Hallucination Risk</div>
            <div
              style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '4px',
                backgroundColor: state.evaluations.hallucinationRisk === 'LOW' ? '#064e3b' : '#7f1d1d',
                color: state.evaluations.hallucinationRisk === 'LOW' ? '#6ee7b7' : '#fca5a5',
              }}
            >
              {state.evaluations.hallucinationRisk}
            </div>
          </div>
        </div>
      </div>

      {/* Query Bar */}
      <div style={{ display: 'flex', gap: '8px', backgroundColor: '#020617', padding: '10px 14px', borderRadius: '8px', border: '1px solid #1e293b' }}>
        <input
          type="text"
          value={queryInput}
          onChange={(e) => setQueryInput(e.target.value)}
          placeholder="Enter natural language query..."
          style={{
            flex: 1,
            backgroundColor: '#0f172a',
            border: '1px solid #334155',
            color: '#f8fafc',
            padding: '8px 12px',
            borderRadius: '6px',
            fontSize: '0.85rem',
          }}
        />
        <button
          onClick={() => onExecuteQuery?.(`q-${Date.now()}`, queryInput)}
          style={{
            backgroundColor: '#2563eb',
            color: '#fff',
            border: 'none',
            padding: '8px 16px',
            borderRadius: '6px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          🔍 Hybrid Retrieve
        </button>
        {state.activeQuery && (
          <button
            onClick={() => onSynthesize?.(state.activeQuery!.queryId)}
            style={{
              backgroundColor: '#10b981',
              color: '#fff',
              border: 'none',
              padding: '8px 14px',
              borderRadius: '6px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            ✨ Synthesize & Ground
          </button>
        )}
        <button
          onClick={() => onInjectOutOfDomain?.('Quantum teleportation in black holes')}
          style={{
            backgroundColor: '#7c2d12',
            color: '#fdba74',
            border: '1px solid #c2410c',
            padding: '8px 12px',
            borderRadius: '6px',
            fontSize: '0.75rem',
            cursor: 'pointer',
          }}
        >
          ⚠️ Out-Of-Domain Stress
        </button>
      </div>

      {/* Main Dual-Funnel & Context Window Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '16px', flex: 1, minHeight: 0 }}>
        {/* Left Column: Dual Retriever Funnel + RRF Combiner */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            {/* Dense Vector Column */}
            <div style={{ backgroundColor: '#090d16', border: '1px solid #1e293b', borderRadius: '8px', padding: '12px' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#38bdf8', marginBottom: '8px' }}>
                🔹 Dense Cosine Retrieval (Top-K: {state.retrievalPipeline.denseTopK})
              </div>
              {state.activeQuery?.denseMatches.map((m: any) => (
                <div
                  key={m.chunkId}
                  style={{
                    backgroundColor: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '4px',
                    padding: '6px 8px',
                    marginBottom: '6px',
                    fontSize: '0.75rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#93c5fd' }}>
                    <strong>{m.chunkId}</strong>
                    <span>Score: {m.score.toFixed(3)} (Rank {m.rank})</span>
                  </div>
                  <div style={{ color: '#64748b', fontSize: '0.7rem', marginTop: '2px' }}>
                    {state.chunks[m.chunkId]?.content.slice(0, 60)}...
                  </div>
                </div>
              )) || <div style={{ fontSize: '0.75rem', color: '#475569' }}>Run query to execute dense search...</div>}
            </div>

            {/* Sparse BM25 Column */}
            <div style={{ backgroundColor: '#090d16', border: '1px solid #1e293b', borderRadius: '8px', padding: '12px' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#a855f7', marginBottom: '8px' }}>
                🔸 Sparse Lexical BM25 (Top-K: {state.retrievalPipeline.sparseTopK})
              </div>
              {state.activeQuery?.sparseMatches.map((m: any) => (
                <div
                  key={m.chunkId}
                  style={{
                    backgroundColor: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '4px',
                    padding: '6px 8px',
                    marginBottom: '6px',
                    fontSize: '0.75rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#d8b4fe' }}>
                    <strong>{m.chunkId}</strong>
                    <span>Score: {m.score.toFixed(3)} (Rank {m.rank})</span>
                  </div>
                  <div style={{ color: '#64748b', fontSize: '0.7rem', marginTop: '2px' }}>
                    {state.chunks[m.chunkId]?.content.slice(0, 60)}...
                  </div>
                </div>
              )) || <div style={{ fontSize: '0.75rem', color: '#475569' }}>Run query to execute BM25 search...</div>}
            </div>
          </div>

          {/* RRF Combiner & Re-Ranked */}
          <div style={{ backgroundColor: '#090d16', border: '1px solid #1e293b', borderRadius: '8px', padding: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#f59e0b' }}>
                ⚡ Reciprocal Rank Fusion (RRF k={state.retrievalPipeline.rrfK}) & Cross-Encoder Cut
              </div>
              <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                Formula: RRF(d) = Σ w / (k + rank)
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '8px' }}>
              {state.activeQuery?.fusedMatches.map((m: any) => (
                <div
                  key={m.chunkId}
                  style={{
                    backgroundColor: '#1e293b',
                    border: '1px solid #475569',
                    borderRadius: '6px',
                    padding: '8px',
                    fontSize: '0.75rem',
                  }}
                >
                  <div style={{ fontWeight: 700, color: '#fbbf24' }}>{m.chunkId}</div>
                  <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>RRF Score: {m.rrfScore.toFixed(5)}</div>
                  <div style={{ fontSize: '0.7rem', color: '#38bdf8' }}>Combined Rank #{m.rank}</div>
                </div>
              )) || <div style={{ fontSize: '0.75rem', color: '#475569' }}>Awaiting query fusion results...</div>}
            </div>
          </div>
        </div>

        {/* Right Column: Context Window Packing & Attention Curve */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', backgroundColor: '#090d16', border: '1px solid #1e293b', borderRadius: '8px', padding: '14px', overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#f8fafc' }}>
              🧠 Context Window Packing ({totalContextTokens} / {state.contextWindow.maxBudgetTokens} Tokens)
            </div>
            <label style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={lostInMiddle}
                onChange={(e) => {
                  setLostInMiddle(e.target.checked);
                  onPackContext?.(state.contextWindow.maxBudgetTokens, e.target.checked);
                }}
              />
              <span style={{ color: '#38bdf8' }}>Lost-in-the-Middle Reorder</span>
            </label>
          </div>

          {/* Visual Memory Strip */}
          <div style={{ width: '100%', height: '24px', backgroundColor: '#1e293b', borderRadius: '4px', overflow: 'hidden', display: 'flex', border: '1px solid #334155' }}>
            <div
              style={{
                width: `${Math.round((state.contextWindow.systemPromptTokens / state.contextWindow.maxBudgetTokens) * 100)}%`,
                backgroundColor: '#3b82f6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.65rem',
                fontWeight: 700,
              }}
              title={`System Prompt: ${state.contextWindow.systemPromptTokens} tokens`}
            >
              SYS
            </div>
            <div
              style={{
                width: `${Math.round((state.contextWindow.queryTokens / state.contextWindow.maxBudgetTokens) * 100)}%`,
                backgroundColor: '#8b5cf6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.65rem',
                fontWeight: 700,
              }}
              title={`User Query: ${state.contextWindow.queryTokens} tokens`}
            >
              QRY
            </div>
            {state.contextWindow.packedChunks.map((c: any, idx: number) => (
              <div
                key={c.chunkId}
                style={{
                  width: `${Math.round((c.tokens / state.contextWindow.maxBudgetTokens) * 100)}%`,
                  backgroundColor: idx % 2 === 0 ? '#10b981' : '#059669',
                  borderLeft: '1px solid #0f172a',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.65rem',
                  fontWeight: 700,
                }}
                title={`Chunk ${c.chunkId}: ${c.tokens} tokens (Score: ${c.rerankScore.toFixed(2)})`}
              >
                C{c.position}
              </div>
            ))}
          </div>
          <div style={{ fontSize: '0.7rem', color: '#94a3b8', display: 'flex', justifyContent: 'space-between' }}>
            <span>Token Budget Used: {contextPct}%</span>
            <span>Attention Curve: {lostInMiddle ? 'Extremes-Boosted (Liu et al. 2023)' : 'Sequential'}</span>
          </div>

          {/* Synthesized Response View */}
          {state.activeQuery?.response && (
            <div style={{ backgroundColor: '#020617', border: '1px solid #10b981', borderRadius: '6px', padding: '10px', marginTop: '6px' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#10b981', marginBottom: '4px' }}>
                🤖 Grounded Answer Synthesized:
              </div>
              <div style={{ fontSize: '0.8rem', color: '#e2e8f0', lineHeight: 1.4 }}>
                {state.activeQuery.response}
              </div>
              {state.activeQuery.citations && state.activeQuery.citations.length > 0 && (
                <div style={{ marginTop: '8px', display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Verified Citations:</span>
                  {state.activeQuery.citations.map((cite: string) => (
                    <span
                      key={cite}
                      style={{
                        backgroundColor: '#1e3a8a',
                        color: '#bfdbfe',
                        padding: '1px 6px',
                        borderRadius: '4px',
                        fontSize: '0.65rem',
                        fontWeight: 600,
                      }}
                    >
                      [{cite}]
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
