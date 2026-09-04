import React from 'react';

export interface ProgressRingProps {
  value: number; // 0 - 100
  size?: number;
  strokeWidth?: number;
  color?: string;
  backgroundColor?: string;
  label?: React.ReactNode;
}

export const ProgressRing: React.FC<ProgressRingProps> = ({
  value,
  size = 48,
  strokeWidth = 4,
  color = '#10b981',
  backgroundColor = '#e2e8f0',
  label,
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clampedValue = Math.max(0, Math.min(100, value));
  const strokeDashoffset = circumference - (clampedValue / 100) * circumference;

  return (
    <div
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
      }}
    >
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={backgroundColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          fill="none"
          style={{ transition: 'stroke-dashoffset 300ms ease' }}
        />
      </svg>
      {label !== undefined && (
        <div
          style={{
            position: 'absolute',
            fontSize: `${Math.round(size * 0.28)}px`,
            fontWeight: 700,
            fontFamily: 'JetBrains Mono, Fira Code, monospace',
            color: 'var(--text-primary, #0f172a)',
          }}
        >
          {label}
        </div>
      )}
    </div>
  );
};
