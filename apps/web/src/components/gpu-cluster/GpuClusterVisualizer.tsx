'use client';

import React from 'react';

import type { GPUClusterState, ZeROStage } from '@the-visualizer/simulation';

export interface GpuClusterVisualizerProps {
  state: GPUClusterState;
  onStep1F1B?: () => void;
  onStepAllReduce?: () => void;
  onSetZeroStage?: (stage: ZeROStage) => void;
  onThrottleStraggler?: (gpuId: string, throttled: boolean) => void;
  onSeverNVLink?: (sourceGPU: string, targetGPU: string) => void;
}

export function GpuClusterVisualizer({
  state,
  onStep1F1B,
  onStepAllReduce,
  onSetZeroStage,
  onThrottleStraggler,
  onSeverNVLink,
}: GpuClusterVisualizerProps): React.JSX.Element {
  const { parallelismConfig, gpus, pipelineSchedule, allReduceState, zeroStage } = state;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '16px', gap: '16px', color: '#f8fafc' }}>
      {/* Top Banner & Distributed Training Metrics */}
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
            <span style={{ fontSize: '1.2rem' }}>🖥️</span>
            <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
              GPU Cluster Scheduling & 3D Parallelism (Megatron-LM / ZeRO)
            </h2>
            <span style={{ backgroundColor: '#831843', color: '#fbcfe8', fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px' }}>
              3D Parallel (TP x PP x DP)
            </span>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '2px' }}>
            Cluster: <code>{state.clusterId}</code> · Tick: <strong>{state.tick}</strong> · Config: <strong>TP={parallelismConfig.tensorParallel} · PP={parallelismConfig.pipelineParallel} · DP={parallelismConfig.dataParallel} ({parallelismConfig.totalGPUs} GPUs)</strong>
          </div>
        </div>

        {/* Training Performance Gauges */}
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>Pipeline Bubble</div>
            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#f59e0b' }}>
              {(pipelineSchedule.bubbleFraction * 100).toFixed(1)}%
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>MFU (Model Flops)</div>
            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#10b981' }}>
              {state.metrics.modelFlopsUtilizationPct}%
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>Step Latency</div>
            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#38bdf8' }}>
              {state.metrics.stepTimeMs} ms
            </div>
          </div>
        </div>
      </div>

      {/* Action Controls Bar */}
      <div style={{ display: 'flex', gap: '10px', backgroundColor: '#020617', padding: '10px 14px', borderRadius: '8px', border: '1px solid #1e293b', alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          onClick={() => onStep1F1B?.()}
          style={{ backgroundColor: '#ec4899', color: '#fff', border: 'none', padding: '6px 16px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}
        >
          ▶ Step 1F1B Microbatch
        </button>
        <button
          onClick={() => onStepAllReduce?.()}
          style={{ backgroundColor: '#2563eb', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}
        >
          🔄 Step Ring-AllReduce ({allReduceState.step})
        </button>

        {/* ZeRO Stage Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto' }}>
          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>ZeRO Stage:</span>
          {(['ZeRO-0', 'ZeRO-1', 'ZeRO-2', 'ZeRO-3'] as ZeROStage[]).map((stage) => (
            <button
              key={stage}
              onClick={() => onSetZeroStage?.(stage)}
              style={{
                backgroundColor: zeroStage === stage ? '#065f46' : '#0f172a',
                color: zeroStage === stage ? '#6ee7b7' : '#94a3b8',
                border: '1px solid #334155',
                padding: '3px 8px',
                borderRadius: '4px',
                fontSize: '0.75rem',
                cursor: 'pointer',
              }}
            >
              {stage}
            </button>
          ))}
        </div>

        {/* Chaos buttons */}
        <button
          onClick={() => onThrottleStraggler?.('gpu-2', gpus['gpu-2']?.status !== 'THROTTLED')}
          style={{
            backgroundColor: gpus['gpu-2']?.status === 'THROTTLED' ? '#7f1d1d' : '#451a03',
            color: '#fdba74',
            border: '1px solid #c2410c',
            padding: '4px 10px',
            borderRadius: '4px',
            fontSize: '0.75rem',
            cursor: 'pointer',
          }}
        >
          ⚠️ Throttle GPU 2
        </button>
        <button
          onClick={() => onSeverNVLink?.('gpu-0', 'gpu-1')}
          style={{
            backgroundColor: '#831843',
            color: '#fbcfe8',
            border: '1px solid #be185d',
            padding: '4px 10px',
            borderRadius: '4px',
            fontSize: '0.75rem',
            cursor: 'pointer',
          }}
        >
          💥 Sever NVLink
        </button>
      </div>

      {/* Main Rack Topography & 1F1B Schedule Waterfall */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: '16px', flex: 1, minHeight: 0 }}>
        {/* Left: GPU Nodes & Rack Topography */}
        <div style={{ backgroundColor: '#090d16', border: '1px solid #1e293b', borderRadius: '8px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#f8fafc' }}>
              Rack Chassis Topography (8x NVIDIA H100 SXM5 80GB)
            </div>
            <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>NVLink 900 GB/s · InfiniBand 400G</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
            {/* Rack 1 */}
            <div style={{ backgroundColor: '#020617', border: '1px solid #1e293b', borderRadius: '6px', padding: '10px' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#ec4899', marginBottom: '8px' }}>
                Rack #1 (GPUs 0–3) · Intra-Chassis NVLink Mesh
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                {[0, 1, 2, 3].map((idx) => {
                  const gpu = gpus[`gpu-${idx}`];
                  if (!gpu) return null;
                  const isThrottled = gpu.status === 'THROTTLED';

                  return (
                    <div
                      key={gpu.id}
                      style={{
                        backgroundColor: '#0f172a',
                        border: isThrottled ? '1px solid #ef4444' : '1px solid #334155',
                        borderRadius: '4px',
                        padding: '8px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong style={{ fontSize: '0.75rem', color: '#f8fafc' }}>GPU #{idx}</strong>
                        <span style={{ fontSize: '0.65rem', color: isThrottled ? '#ef4444' : '#10b981' }}>
                          {isThrottled ? 'THROTTLED' : '92%'}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.65rem', color: '#94a3b8', marginTop: '4px' }}>
                        Temp: <span style={{ color: isThrottled ? '#ef4444' : '#f8fafc' }}>{gpu.temperatureC}°C</span>
                      </div>
                      <div style={{ fontSize: '0.65rem', color: '#38bdf8', marginTop: '2px' }}>
                        VRAM: {(gpu.memoryAllocatedMB / 1024).toFixed(1)} / 80 GB
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Rack 2 */}
            <div style={{ backgroundColor: '#020617', border: '1px solid #1e293b', borderRadius: '6px', padding: '10px' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#ec4899', marginBottom: '8px' }}>
                Rack #2 (GPUs 4–7) · Intra-Chassis NVLink Mesh
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                {[4, 5, 6, 7].map((idx) => {
                  const gpu = gpus[`gpu-${idx}`];
                  if (!gpu) return null;

                  return (
                    <div
                      key={gpu.id}
                      style={{
                        backgroundColor: '#0f172a',
                        border: '1px solid #334155',
                        borderRadius: '4px',
                        padding: '8px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong style={{ fontSize: '0.75rem', color: '#f8fafc' }}>GPU #{idx}</strong>
                        <span style={{ fontSize: '0.65rem', color: '#10b981' }}>92%</span>
                      </div>
                      <div style={{ fontSize: '0.65rem', color: '#94a3b8', marginTop: '4px' }}>
                        Temp: {gpu.temperatureC}°C
                      </div>
                      <div style={{ fontSize: '0.65rem', color: '#38bdf8', marginTop: '2px' }}>
                        VRAM: {(gpu.memoryAllocatedMB / 1024).toFixed(1)} / 80 GB
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Interconnect Links */}
          <div style={{ borderTop: '1px solid #1e293b', paddingTop: '8px' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#38bdf8', marginBottom: '4px' }}>
              🔗 Interconnect Fabric Status
            </div>
            <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
              Cross-Rack InfiniBand: <code>gpu-3 ↔ gpu-4</code> (400 Gbps · 50 GB/s) · Ring-AllReduce Step: <strong style={{ color: '#f59e0b' }}>{allReduceState.step}</strong>
            </div>
          </div>
        </div>

        {/* Right: 1F1B Pipeline Schedule Waterfall Gantt */}
        <div style={{ backgroundColor: '#090d16', border: '1px solid #1e293b', borderRadius: '8px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#f8fafc' }}>
              🌊 1F1B Pipeline Schedule Waterfall (PP={pipelineSchedule.numStages})
            </div>
            <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>One-Forward-One-Backward (Narayanan et al.)</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {Array.from({ length: pipelineSchedule.numStages }).map((_, stageIdx) => {
              const activeStep = pipelineSchedule.activeSteps.find((s: any) => s.stage === stageIdx);

              return (
                <div
                  key={stageIdx}
                  style={{
                    backgroundColor: '#020617',
                    border: '1px solid #1e293b',
                    borderRadius: '6px',
                    padding: '10px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <strong style={{ fontSize: '0.75rem', color: '#ec4899' }}>
                      Pipeline Stage #{stageIdx} (GPUs {stageIdx * 2}, {stageIdx * 2 + 1})
                    </strong>
                    <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>
                      Current Phase: {activeStep?.phase || 'IDLE'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <div
                      style={{
                        padding: '4px 12px',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        backgroundColor: activeStep?.phase === 'F' ? '#1e3a8a' : activeStep?.phase === 'B' ? '#064e3b' : '#334155',
                        color: activeStep?.phase === 'F' ? '#93c5fd' : activeStep?.phase === 'B' ? '#6ee7b7' : '#94a3b8',
                      }}
                    >
                      {activeStep?.phase === 'F' ? `Forward (F${activeStep.microbatch})` : activeStep?.phase === 'B' ? `Backward (B${activeStep.microbatch})` : 'Bubble (--)'}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: 'auto', borderTop: '1px solid #1e293b', paddingTop: '10px' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#f59e0b', marginBottom: '4px' }}>
              💡 DeepSpeed ZeRO Memory Sharding Profile
            </div>
            <div style={{ fontSize: '0.7rem', color: '#cbd5e1' }}>
              Current Mode: <strong>{zeroStage}</strong> · Memory Savings: <strong>{state.metrics.memorySavingsRatio}x</strong> compared to baseline FP32 full replica.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
