import React from 'react';

export interface GaugeProps {
  value: number; // 0 - 100
  label: string;
  sublabel?: string;
  color?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const Gauge: React.FC<GaugeProps> = ({
  value,
  label,
  sublabel,
  color = '#3b82f6',
  size = 'md',
}) => {
  const clamped = Math.max(0, Math.min(100, value));

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        fontFamily: 'Inter, system-ui, sans-serif',
        minWidth: size === 'sm' ? '120px' : '160px',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          fontSize: size === 'sm' ? '11px' : '12px',
        }}
      >
        <span style={{ fontWeight: 500, color: 'var(--text-secondary, #475569)' }}>{label}</span>
        <span
          style={{
            fontWeight: 700,
            fontFamily: 'JetBrains Mono, Fira Code, monospace',
            color: 'var(--text-primary, #0f172a)',
          }}
        >
          {sublabel ?? `${Math.round(clamped)}%`}
        </span>
      </div>
      <div
        style={{
          width: '100%',
          height: size === 'sm' ? '6px' : '8px',
          borderRadius: '4px',
          background: '#e2e8f0',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${clamped}%`,
            background: color,
            borderRadius: '4px',
            transition: 'width 250ms ease',
          }}
        />
      </div>
    </div>
  );
};
