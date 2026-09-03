import React from 'react';

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  domainColor?: string;
  size?: 'sm' | 'md';
}

export const Toggle: React.FC<ToggleProps> = ({
  checked,
  onChange,
  label,
  disabled = false,
  domainColor = '#3b82f6',
  size = 'md',
}) => {
  const isSm = size === 'sm';
  const width = isSm ? 32 : 40;
  const height = isSm ? 18 : 22;
  const knobSize = isSm ? 14 : 18;
  const offset = isSm ? 2 : 2;

  return (
    <label
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        userSelect: 'none',
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: isSm ? '12px' : '13px',
        fontWeight: 500,
        color: 'var(--text-primary, #0f172a)',
      }}
    >
      <div
        role="switch"
        aria-checked={checked}
        aria-label={label ?? 'Toggle switch'}
        tabIndex={disabled ? -1 : 0}
        onClick={() => !disabled && onChange(!checked)}
        onKeyDown={(e) => {
          if (!disabled && (e.key === ' ' || e.key === 'Enter')) {
            e.preventDefault();
            onChange(!checked);
          }
        }}
        style={{
          width: `${width}px`,
          height: `${height}px`,
          borderRadius: `${height}px`,
          background: checked ? domainColor : '#cbd5e1',
          position: 'relative',
          transition: 'background 200ms ease',
          boxShadow: checked ? `0 0 8px ${domainColor}55` : 'none',
          outline: 'none',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: `${offset}px`,
            left: checked ? `${width - knobSize - offset}px` : `${offset}px`,
            width: `${knobSize}px`,
            height: `${knobSize}px`,
            borderRadius: '50%',
            background: '#ffffff',
            boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
            transition: 'left 200ms cubic-bezier(0.34, 1.56, 0.64, 1)',
          }}
        />
      </div>
      {label && <span>{label}</span>}
    </label>
  );
};
