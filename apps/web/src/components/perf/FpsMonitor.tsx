'use client';

import React from 'react';

export interface RenderPerfMetrics {
  fps: number;
  frameTimeMs: number;
  renderedEntities: number;
  culledEntities: number;
  particleCount: number;
  poolSize: number;
}

export interface FpsMonitorProps {
  metrics: RenderPerfMetrics;
  isOpen: boolean;
  onToggle: () => void;
}

export function FpsMonitor({ metrics, isOpen, onToggle }: FpsMonitorProps): React.JSX.Element {
  const fpsColor =
    metrics.fps >= 55 ? '#10b981' : metrics.fps >= 30 ? '#f59e0b' : '#ef4444';

  const frameTimeBudgetMs = 16.67; // 60 FPS target
  const frameBudgetPct = Math.min(100, (metrics.frameTimeMs / frameTimeBudgetMs) * 100);
  const budgetColor =
    metrics.frameTimeMs <= 10 ? '#10b981' : metrics.frameTimeMs <= 16.6 ? '#f59e0b' : '#ef4444';

  return (
    <div
      style={{
        position: 'absolute',
        top: '12px',
        right: '12px',
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: '6px',
        fontFamily: 'monospace',
      }}
    >
      {/* Pill Toggle Button */}
      <button
        onClick={onToggle}
        title="Toggle Canvas 60 FPS Performance Telemetry HUD"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '4px 10px',
          backgroundColor: 'rgba(15, 23, 42, 0.85)',
          backdropFilter: 'blur(8px)',
          border: '1px solid #334155',
          borderRadius: '9999px',
          color: '#f8fafc',
          fontSize: '0.75rem',
          cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
        }}
      >
        <span
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: fpsColor,
            boxShadow: `0 0 8px ${fpsColor}`,
          }}
        />
        <span style={{ fontWeight: 700, color: fpsColor }}>{metrics.fps} FPS</span>
        <span style={{ color: '#64748b' }}>|</span>
        <span style={{ color: '#94a3b8' }}>{metrics.frameTimeMs.toFixed(1)}ms</span>
        <span style={{ fontSize: '0.65rem', color: '#64748b' }}>{isOpen ? '▲' : '▼'}</span>
      </button>

      {/* Expanded Telemetry Card */}
      {isOpen && (
        <div
          style={{
            width: '230px',
            backgroundColor: 'rgba(15, 23, 42, 0.92)',
            backdropFilter: 'blur(12px)',
            border: '1px solid #334155',
            borderRadius: '8px',
            padding: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            color: '#e2e8f0',
            fontSize: '0.75rem',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.6)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderBottom: '1px solid #1e293b',
              paddingBottom: '6px',
            }}
          >
            <span style={{ fontWeight: 700, color: '#38bdf8', fontSize: '0.7rem' }}>
              ⚡ 60 FPS RENDER HUD
            </span>
            <span style={{ color: '#64748b', fontSize: '0.65rem' }}>16.6ms Target</span>
          </div>

          {/* Budget Bar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem' }}>
              <span style={{ color: '#94a3b8' }}>Frame Time:</span>
              <span style={{ fontWeight: 600, color: budgetColor }}>
                {metrics.frameTimeMs.toFixed(2)}ms
              </span>
            </div>
            <div
              style={{
                width: '100%',
                height: '5px',
                backgroundColor: '#1e293b',
                borderRadius: '3px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${frameBudgetPct}%`,
                  height: '100%',
                  backgroundColor: budgetColor,
                  transition: 'width 0.1s ease',
                }}
              />
            </div>
          </div>

          {/* Entities & Culling */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '6px',
              padding: '6px',
              backgroundColor: '#020617',
              borderRadius: '6px',
              border: '1px solid #1e293b',
            }}
          >
            <div>
              <div style={{ color: '#64748b', fontSize: '0.65rem' }}>Rendered</div>
              <div style={{ fontWeight: 700, color: '#34d399', fontSize: '0.85rem' }}>
                {metrics.renderedEntities}
              </div>
            </div>
            <div>
              <div style={{ color: '#64748b', fontSize: '0.65rem' }}>Culled (Off-screen)</div>
              <div style={{ fontWeight: 700, color: '#f59e0b', fontSize: '0.85rem' }}>
                {metrics.culledEntities}
              </div>
            </div>
          </div>

          {/* Particle Pool */}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem' }}>
            <span style={{ color: '#94a3b8' }}>In-Flight Particles:</span>
            <span style={{ fontWeight: 600, color: '#c084fc' }}>{metrics.particleCount}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem' }}>
            <span style={{ color: '#94a3b8' }}>Pooled Objects (Zero-GC):</span>
            <span style={{ fontWeight: 600, color: '#38bdf8' }}>{metrics.poolSize}</span>
          </div>
        </div>
      )}
    </div>
  );
}
