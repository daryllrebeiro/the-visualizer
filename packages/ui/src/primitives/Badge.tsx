import React from 'react';

export type BadgeVariant =
  'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple' | 'custom';
export type BadgeSize = 'xs' | 'sm' | 'md';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant | undefined;
  size?: BadgeSize | undefined;
  color?: string | undefined;
  dot?: boolean | undefined;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'default',
  size = 'sm',
  color,
  dot = false,
  style = {},
  className = '',
  ...props
}) => {
  const sizeStyles: Record<BadgeSize, React.CSSProperties> = {
    xs: { padding: '2px 6px', fontSize: '10px', borderRadius: '4px' },
    sm: { padding: '3px 8px', fontSize: '11px', borderRadius: '6px' },
    md: { padding: '4px 10px', fontSize: '12px', borderRadius: '8px' },
  };

  const getVariantStyles = (): { bg: string; text: string; border: string; dotColor: string } => {
    switch (variant) {
      case 'success':
        return { bg: '#f0fdf4', text: '#15803d', border: '#bbf7d0', dotColor: '#22c55e' };
      case 'warning':
        return { bg: '#fefce8', text: '#a16207', border: '#fde68a', dotColor: '#eab308' };
      case 'danger':
        return { bg: '#fef2f2', text: '#b91c1c', border: '#fecaca', dotColor: '#ef4444' };
      case 'info':
        return { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe', dotColor: '#3b82f6' };
      case 'purple':
        return { bg: '#faf5ff', text: '#7e22ce', border: '#e9d5ff', dotColor: '#a855f7' };
      case 'custom':
        return {
          bg: color ? `${color}18` : '#f1f5f9',
          text: color ?? '#334155',
          border: color ? `${color}44` : '#cbd5e1',
          dotColor: color ?? '#64748b',
        };
      case 'default':
      default:
        return { bg: '#f1f5f9', text: '#334155', border: '#e2e8f0', dotColor: '#94a3b8' };
    }
  };

  const vs = getVariantStyles();

  return (
    <span
      className={`the-badge ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        fontWeight: 600,
        fontFamily: 'Inter, system-ui, sans-serif',
        background: vs.bg,
        color: vs.text,
        border: `1px solid ${vs.border}`,
        lineHeight: 1.2,
        letterSpacing: '0.01em',
        ...sizeStyles[size],
        ...style,
      }}
      {...props}
    >
      {dot && (
        <span
          style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: vs.dotColor,
            flexShrink: 0,
          }}
        />
      )}
      {children}
    </span>
  );
};
