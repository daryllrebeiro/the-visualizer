'use client';

import React, { useState } from 'react';

import type { LLMServingClusterState } from '@the-visualizer/simulation';

export interface LlmServingVisualizerProps {
  state: LLMServingClusterState;
  onSubmitRequest?: (requestId: string, promptTokens: number, maxGeneratedTokens: number) => void;
  onStepBatch?: () => void;
  onToggleSpeculative?: (enabled: boolean, gamma?: number) => void;
  onPreemptRequest?: (requestId: string) => void;
  onInjectOOM?: (count: number) => void;
}

export function LlmServingVisualizer({
  state,
  onSubmitRequest,
  onStepBatch,
  onToggleSpeculative,
  onPreemptRequest,
  onInjectOOM,
}: LlmServingVisualizerProps): React.JSX.Element {
  const [promptTokens, setPromptTokens] = useState<number>(32);
  const [maxGenTokens, setMaxGenTokens] = useState<number>(24);

  const totalBlocks = state.kvBlockPool.totalBlocks;
  const freeBlocks = state.kvBlockPool.freeBlockIndices.length;
  const allocatedBlocks = totalBlocks - freeBlocks;

  const requestColors: Record<string, string> = {
    'req-1': '#3b82f6',
    'req-2': '#10b981',
    'req-3': '#f59e0b',
    'req-4': '#ec4899',
    'req-5': '#8b5cf6',
  };

  const getRequestColor = (reqId?: string) => {
    if (!reqId) return '#1e293b';
    return requestColors[reqId] || '#0284c7';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '16px', gap: '16px', color: '#f8fafc' }}>
      {/* Top Banner & Hardware Metrics */}
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
            <span style={{ fontSize: '1.2rem' }}>⚡</span>
            <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
              LLM Inference Serving & PagedAttention Engine
            </h2>
            <span style={{ backgroundColor: '#064e3b', color: '#6ee7b7', fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px' }}>
              vLLM / Orca SOSP '23
            </span>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '2px' }}>
            Cluster: <code>{state.clusterId}</code> · Tick: <strong>{state.tick}</strong> · Block Size: <strong>{state.kvBlockPool.blockSizeTokens} tokens</strong> · Batch Size: {state.batchScheduler.runningRequestIds.length} / {state.batchScheduler.maxBatchSize}
          </div>
        </div>

        {/* VRAM & Latency Gauges */}
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>GPU VRAM Allocated</div>
            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: state.metrics.gpuVramUtilizationPct > 80 ? '#ef4444' : '#10b981' }}>
              {allocatedBlocks} / {totalBlocks} Blocks ({state.metrics.gpuVramUtilizationPct}%)
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>Requests Completed</div>
            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#38bdf8' }}>
              {state.metrics.totalCompleted}
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>Preemptions (OOM)</div>
            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: state.metrics.preemptionCount > 0 ? '#f59e0b' : '#64748b' }}>
              {state.metrics.preemptionCount}
            </div>
          </div>
        </div>
      </div>

      {/* Action Controls Bar */}
      <div style={{ display: 'flex', gap: '10px', backgroundColor: '#020617', padding: '10px 14px', borderRadius: '8px', border: '1px solid #1e293b', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Prompt Tokens:</span>
          <input
            type="number"
            value={promptTokens}
            onChange={(e) => setPromptTokens(Number(e.target.value))}
            style={{ width: '60px', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#f8fafc', padding: '4px 6px', borderRadius: '4px', fontSize: '0.8rem' }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Max Generated:</span>
          <input
            type="number"
            value={maxGenTokens}
            onChange={(e) => setMaxGenTokens(Number(e.target.value))}
            style={{ width: '60px', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#f8fafc', padding: '4px 6px', borderRadius: '4px', fontSize: '0.8rem' }}
          />
        </div>
        <button
          onClick={() => onSubmitRequest?.(`req-${Date.now().toString().slice(-4)}`, promptTokens, maxGenTokens)}
          style={{ backgroundColor: '#2563eb', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}
        >
          ➕ Submit Request
        </button>
        <button
          onClick={() => onStepBatch?.()}
          style={{ backgroundColor: '#10b981', color: '#fff', border: 'none', padding: '6px 16px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}
        >
          ▶ Step Continuous Batch
        </button>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: '#a78bfa', cursor: 'pointer', marginLeft: 'auto' }}>
          <input
            type="checkbox"
            checked={state.speculativeEngine.enabled}
            onChange={(e) => onToggleSpeculative?.(e.target.checked)}
          />
          Speculative Decoding (γ={state.speculativeEngine.gammaLookahead})
        </label>
        <button
          onClick={() => onInjectOOM?.(4)}
          style={{ backgroundColor: '#7c2d12', color: '#fdba74', border: '1px solid #c2410c', padding: '6px 12px', borderRadius: '6px', fontSize: '0.75rem', cursor: 'pointer' }}
        >
          💥 OOM Flood Stress
        </button>
      </div>

      {/* Main PagedAttention Grid & Continuous Batching Waterfall */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', flex: 1, minHeight: 0 }}>
        {/* Left: Physical GPU KV-Cache Memory Block Grid */}
        <div style={{ backgroundColor: '#090d16', border: '1px solid #1e293b', borderRadius: '8px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#f8fafc' }}>
              🧠 Physical GPU KV-Cache Block Pool ({totalBlocks} Blocks · 16 tok/block)
            </div>
            <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Paged Virtual Memory</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: '6px' }}>
            {Object.values(state.kvBlockPool.blocks).map((block: any) => (
              <div
                key={block.blockIndex}
                style={{
                  backgroundColor: block.requestId ? getRequestColor(block.requestId) : '#0f172a',
                  border: block.requestId ? '1px solid rgba(255,255,255,0.2)' : '1px solid #1e293b',
                  borderRadius: '4px',
                  padding: '6px 4px',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px',
                }}
              >
                <span style={{ fontSize: '0.65rem', fontWeight: 700, color: block.requestId ? '#ffffff' : '#64748b' }}>
                  #{block.blockIndex}
                </span>
                <span style={{ fontSize: '0.6rem', color: block.requestId ? '#e2e8f0' : '#475569' }}>
                  {block.requestId ? block.requestId.slice(-5) : 'FREE'}
                </span>
              </div>
            ))}
          </div>

          {/* Page Tables Overview */}
          <div style={{ marginTop: '10px', borderTop: '1px solid #1e293b', paddingTop: '8px' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#38bdf8', marginBottom: '6px' }}>
              📑 Logical-to-Physical Request Page Tables
            </div>
            {Object.entries(state.blockTable).map(([reqId, blocks]: [string, any]) => (
              <div key={reqId} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.7rem', marginBottom: '4px' }}>
                <strong style={{ color: getRequestColor(reqId), width: '70px' }}>{reqId}:</strong>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                  {blocks.map((bIdx: any, lIdx: any) => (
                    <span key={bIdx} style={{ backgroundColor: '#1e293b', padding: '1px 6px', borderRadius: '3px', color: '#94a3b8' }}>
                      L{lIdx} → P#{bIdx}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Continuous Batching Waterfall */}
        <div style={{ backgroundColor: '#090d16', border: '1px solid #1e293b', borderRadius: '8px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#f8fafc' }}>
              🌊 Orca Continuous Batching Waterfall ({Object.keys(state.requests).length} Requests)
            </div>
            <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Prefill & Decode Mixed Scheduling</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, overflowY: 'auto' }}>
            {Object.values(state.requests).map((req: any) => (
              <div
                key={req.id}
                style={{
                  backgroundColor: '#020617',
                  border: `1px solid ${getRequestColor(req.id)}`,
                  borderRadius: '6px',
                  padding: '10px',
                  fontSize: '0.75rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ color: getRequestColor(req.id) }}>{req.id}</strong>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <span
                      style={{
                        padding: '1px 6px',
                        borderRadius: '3px',
                        fontSize: '0.65rem',
                        fontWeight: 700,
                        backgroundColor: req.state === 'PREFILL' ? '#1e3a8a' : req.state === 'DECODE' ? '#064e3b' : req.state === 'PREEMPTED' ? '#7f1d1d' : '#1e293b',
                        color: req.state === 'PREFILL' ? '#93c5fd' : req.state === 'DECODE' ? '#6ee7b7' : req.state === 'PREEMPTED' ? '#fca5a5' : '#94a3b8',
                      }}
                    >
                      {req.state}
                    </span>
                    {(req.state === 'PREFILL' || req.state === 'DECODE') && (
                      <button
                        onClick={() => onPreemptRequest?.(req.id)}
                        style={{ backgroundColor: '#7f1d1d', color: '#fca5a5', border: 'none', padding: '1px 6px', borderRadius: '3px', fontSize: '0.65rem', cursor: 'pointer' }}
                      >
                        Preempt
                      </button>
                    )}
                  </div>
                </div>

                {/* Progress bar */}
                <div style={{ marginTop: '8px', width: '100%', height: '8px', backgroundColor: '#1e293b', borderRadius: '4px', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${Math.min(100, Math.round((req.generatedTokens / req.maxGeneratedTokens) * 100))}%`,
                      height: '100%',
                      backgroundColor: getRequestColor(req.id),
                    }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontSize: '0.7rem', color: '#94a3b8' }}>
                  <span>Tokens: {req.promptTokens} prompt + {req.generatedTokens}/{req.maxGeneratedTokens} gen</span>
                  {state.speculativeEngine.enabled && (
                    <span style={{ color: '#a78bfa' }}>Speculative: +{req.speculativeAcceptedTokens} accepted</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
