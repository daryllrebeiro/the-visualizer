import React from 'react';

export interface SliderProps {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  label?: string;
  valueFormatter?: (value: number) => string;
  disabled?: boolean;
  domainColor?: string;
}

export const Slider: React.FC<SliderProps> = ({
  value,
  onChange,
  min,
  max,
  step = 1,
  label,
  valueFormatter = (v) => `${v}`,
  disabled = false,
  domainColor = '#3b82f6',
}) => {
  const percentage = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        fontFamily: 'Inter, system-ui, sans-serif',
        width: '100%',
      }}
    >
      {(label !== undefined || valueFormatter !== undefined) && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '12px',
            fontWeight: 500,
            color: 'var(--text-secondary, #334155)',
          }}
        >
          {label && <span>{label}</span>}
          {valueFormatter && (
            <span
              style={{
                fontWeight: 600,
                fontFamily: 'JetBrains Mono, Fira Code, monospace',
                color: 'var(--text-primary, #0f172a)',
              }}
            >
              {valueFormatter(value)}
            </span>
          )}
        </div>
      )}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{
            width: '100%',
            height: '6px',
            borderRadius: '4px',
            background: `linear-gradient(to right, ${domainColor} 0%, ${domainColor} ${percentage}%, #e2e8f0 ${percentage}%, #e2e8f0 100%)`,
            appearance: 'none',
            outline: 'none',
            cursor: disabled ? 'not-allowed' : 'pointer',
            margin: 0,
          }}
        />
      </div>
    </div>
  );
};
