import React from 'react';

export interface SelectOption<T extends string | number = string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
  description?: string;
}

export interface SelectProps<T extends string | number = string> {
  value: T;
  onChange: (value: T) => void;
  options: SelectOption<T>[];
  label?: string;
  size?: 'sm' | 'md';
  disabled?: boolean;
  style?: React.CSSProperties;
  className?: string;
}

export const Select = <T extends string | number = string>({
  value,
  onChange,
  options,
  label,
  size = 'md',
  disabled = false,
  style = {},
  className = '',
}: SelectProps<T>): React.JSX.Element => {
  const isSm = size === 'sm';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        fontFamily: 'Inter, system-ui, sans-serif',
        ...style,
      }}
      className={className}
    >
      {label && (
        <label
          style={{
            fontSize: '12px',
            fontWeight: 500,
            color: 'var(--text-secondary, #334155)',
          }}
        >
          {label}
        </label>
      )}
      <select
        value={String(value)}
        onChange={(e) => onChange(e.target.value as unknown as T)}
        aria-label={label ?? 'Select option'}
        disabled={disabled}
        style={{
          padding: isSm ? '4px 8px' : '7px 12px',
          fontSize: isSm ? '12px' : '13px',
          fontWeight: 500,
          borderRadius: isSm ? '6px' : '8px',
          border: '1px solid var(--border-medium, #cbd5e1)',
          background: 'var(--bg-white, #ffffff)',
          color: 'var(--text-primary, #0f172a)',
          outline: 'none',
          cursor: disabled ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit',
          transition: 'border-color 150ms ease, box-shadow 150ms ease',
        }}
      >
        {options.map((opt) => (
          <option key={String(opt.value)} value={String(opt.value)}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
};
