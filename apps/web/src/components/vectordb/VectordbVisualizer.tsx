'use client';

import React, { useState } from 'react';

import type { VectorDBClusterState } from '@the-visualizer/simulation';

export interface VectordbVisualizerProps {
  state: VectorDBClusterState;
  onInsertVector?: (nodeId: string, vector: number[], topLayer?: number) => void;
  onQueryKNN?: (queryId: string, queryVector: number[], k?: number) => void;
  onToggleIndexType?: (indexType: 'HNSW' | 'IVF_PQ') => void;
}

export function VectordbVisualizer({
  state,
  onInsertVector,
  onQueryKNN,
  onToggleIndexType,
}: VectordbVisualizerProps): React.JSX.Element {
  const [queryX, setQueryX] = useState<number>(0.15);
  const [queryY, setQueryY] = useState<number>(0.25);
  const [kVal, setKVal] = useState<number>(2);

  const layers = [2, 1, 0];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '16px', gap: '16px', color: '#f8fafc' }}>
      {/* Top Banner & Recall Metrics */}
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
            <span style={{ fontSize: '1.2rem' }}>🧭</span>
            <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
              Vector Database & Approximate Nearest Neighbor (ANN) Search
            </h2>
            <span style={{ backgroundColor: '#78350f', color: '#fde047', fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px' }}>
              HNSW / IVF-PQ
            </span>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '2px' }}>
            Cluster: <code>{state.clusterId}</code> · Mode: <strong>{state.indexType}</strong> · Indexed Vectors: {state.metrics.totalVectors} · Max Degree (M={state.hnswGraph.M}, M0={state.hnswGraph.M0})
          </div>
        </div>

        {/* Recall Gauge */}
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>Recall@K Accuracy</div>
            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#10b981' }}>
              {(state.metrics.recallAtK * 100).toFixed(0)}%
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>Distance Calculations</div>
            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#38bdf8' }}>
              {state.activeQuery?.distanceComputationsCount ?? 0}
            </div>
          </div>
        </div>
      </div>

      {/* Query Bar */}
      <div style={{ display: 'flex', gap: '10px', backgroundColor: '#020617', padding: '10px 14px', borderRadius: '8px', border: '1px solid #1e293b', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Query Vector (x, y):</span>
        <input
          type="number"
          step="0.05"
          value={queryX}
          onChange={(e) => setQueryX(Number(e.target.value))}
          style={{ width: '65px', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#f8fafc', padding: '4px 6px', borderRadius: '4px', fontSize: '0.8rem' }}
        />
        <input
          type="number"
          step="0.05"
          value={queryY}
          onChange={(e) => setQueryY(Number(e.target.value))}
          style={{ width: '65px', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#f8fafc', padding: '4px 6px', borderRadius: '4px', fontSize: '0.8rem' }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>k:</span>
          <input
            type="number"
            min="1"
            max="5"
            value={kVal}
            onChange={(e) => setKVal(Number(e.target.value))}
            style={{ width: '50px', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#f8fafc', padding: '4px 6px', borderRadius: '4px', fontSize: '0.8rem' }}
          />
        </div>
        <button
          onClick={() => onQueryKNN?.(`q-${Date.now()}`, [queryX, queryY, queryX + 0.1, queryY + 0.1], kVal)}
          style={{ backgroundColor: '#d97706', color: '#fff', border: 'none', padding: '6px 16px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}
        >
          🎯 Search k-NN Beam
        </button>
        <button
          onClick={() => onInsertVector?.(`vec-${Date.now().toString().slice(-4)}`, [queryX + 0.05, queryY + 0.05, 0.3, 0.4], 1)}
          style={{ backgroundColor: '#2563eb', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '6px', fontSize: '0.8rem', cursor: 'pointer' }}
        >
          ➕ Insert Vector
        </button>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
          <button
            onClick={() => onToggleIndexType?.('HNSW')}
            style={{
              backgroundColor: state.indexType === 'HNSW' ? '#1e3a8a' : '#0f172a',
              color: state.indexType === 'HNSW' ? '#93c5fd' : '#94a3b8',
              border: '1px solid #334155',
              padding: '4px 10px',
              borderRadius: '4px',
              fontSize: '0.75rem',
              cursor: 'pointer',
            }}
          >
            HNSW Graph
          </button>
          <button
            onClick={() => onToggleIndexType?.('IVF_PQ')}
            style={{
              backgroundColor: state.indexType === 'IVF_PQ' ? '#1e3a8a' : '#0f172a',
              color: state.indexType === 'IVF_PQ' ? '#93c5fd' : '#94a3b8',
              border: '1px solid #334155',
              padding: '4px 10px',
              borderRadius: '4px',
              fontSize: '0.75rem',
              cursor: 'pointer',
            }}
          >
            IVF-PQ Voronoi
          </button>
        </div>
      </div>

      {/* Main HNSW Layers & Voronoi Space */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '16px', flex: 1, minHeight: 0 }}>
        {/* Left: Multi-Layer HNSW Graph Descent */}
        <div style={{ backgroundColor: '#090d16', border: '1px solid #1e293b', borderRadius: '8px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#f8fafc' }}>
              📐 Hierarchical Multi-Layer Graph (Skip Layers $L_2 \to L_0$)
            </div>
            <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Malkov & Yashunin (2018)</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {layers.map((layer) => {
              const layerNodes = Object.values(state.hnswGraph.nodes).filter(
                (n: any) => n.topLayer >= layer,
              );
              const isLayerActive = state.activeQuery ? state.activeQuery.currentLayer === layer : false;

              return (
                <div
                  key={layer}
                  style={{
                    backgroundColor: isLayerActive ? '#1c1917' : '#020617',
                    border: isLayerActive ? '1px solid #f59e0b' : '1px solid #1e293b',
                    borderRadius: '6px',
                    padding: '10px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <strong style={{ fontSize: '0.75rem', color: layer === 2 ? '#fbbf24' : layer === 1 ? '#38bdf8' : '#34d399' }}>
                      Layer L{layer} {layer === 2 ? '(Sparse Highway)' : layer === 0 ? '(Dense Base)' : '(Intermediate)'}
                    </strong>
                    <span style={{ fontSize: '0.65rem', color: '#64748b' }}>
                      {layerNodes.length} Nodes · Max Conn: {layer === 0 ? state.hnswGraph.M0 : state.hnswGraph.M}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {layerNodes.map((n: any) => {
                      const isVisited = state.activeQuery?.visitedNodeIds.includes(n.id);
                      const isNearest = state.activeQuery?.kNearestResults.some((r: any) => r.nodeId === n.id);

                      return (
                        <div
                          key={n.id}
                          style={{
                            backgroundColor: isNearest ? '#064e3b' : isVisited ? '#451a03' : '#0f172a',
                            border: isNearest ? '1px solid #10b981' : isVisited ? '1px solid #f59e0b' : '1px solid #334155',
                            borderRadius: '4px',
                            padding: '4px 8px',
                            fontSize: '0.7rem',
                          }}
                        >
                          <span style={{ fontWeight: 700, color: isNearest ? '#6ee7b7' : isVisited ? '#fde047' : '#f8fafc' }}>
                            {n.id}
                          </span>
                          <div style={{ fontSize: '0.6rem', color: '#94a3b8' }}>
                            Conn: {n.neighborsByLayer[layer]?.join(', ') || 'none'}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Voronoi Centroids & k-NN Results */}
        <div style={{ backgroundColor: '#090d16', border: '1px solid #1e293b', borderRadius: '8px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#f8fafc' }}>
            🎯 k-Nearest Neighbor Query Results
          </div>

          {state.activeQuery?.kNearestResults && state.activeQuery.kNearestResults.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {state.activeQuery.kNearestResults.map((res: any, idx: number) => (
                <div
                  key={res.nodeId}
                  style={{
                    backgroundColor: '#020617',
                    border: '1px solid #10b981',
                    borderRadius: '6px',
                    padding: '8px 10px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <strong style={{ color: '#34d399', fontSize: '0.8rem' }}>
                      #{idx + 1}: {res.nodeId}
                    </strong>
                    <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>
                      Vector: [{state.hnswGraph.nodes[res.nodeId]?.vector.map((v: number) => v.toFixed(2)).join(', ')}]
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#38bdf8' }}>
                      d = {res.distance.toFixed(4)}
                    </span>
                    <div style={{ fontSize: '0.65rem', color: '#64748b' }}>Euclidean</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: '0.75rem', color: '#475569' }}>
              Submit a query vector to inspect nearest neighbors...
            </div>
          )}

          {/* IVF-PQ Codebook Inspection */}
          <div style={{ marginTop: 'auto', borderTop: '1px solid #1e293b', paddingTop: '10px' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#f59e0b', marginBottom: '6px' }}>
              📦 Product Quantization (PQ) Compression Table
            </div>
            <div style={{ fontSize: '0.65rem', color: '#94a3b8', marginBottom: '6px' }}>
              {state.pqCodebook.subspaces} Subspaces · {state.pqCodebook.centroidsPerSubspace} Centroids/Subspace (8-bit code)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: '6px' }}>
              {Object.entries(state.pqCodebook.quantizedVectors).map(([nodeId, codes]: [string, any]) => (
                <div key={nodeId} style={{ backgroundColor: '#020617', border: '1px solid #1e293b', borderRadius: '4px', padding: '4px 6px', fontSize: '0.65rem' }}>
                  <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{nodeId}:</span>
                  <code style={{ color: '#f59e0b', marginLeft: '4px' }}>[{codes.join(',')}]</code>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
