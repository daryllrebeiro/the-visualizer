import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'elevated' | 'ghost' | 'domain';
  domainColor?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  interactive?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  variant = 'default',
  domainColor,
  padding = 'md',
  interactive = false,
  className = '',
  style = {},
  ...props
}) => {
  const paddingMap = {
    none: '0',
    sm: '12px',
    md: '16px',
    lg: '24px',
  };

  const getVariantStyles = (): React.CSSProperties => {
    switch (variant) {
      case 'elevated':
        return {
          background: 'var(--bg-white, #ffffff)',
          border: '1px solid var(--border-light, #e2e8f0)',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.04)',
        };
      case 'ghost':
        return {
          background: 'rgba(255, 255, 255, 0.5)',
          border: '1px dashed var(--border-medium, #cbd5e1)',
          boxShadow: 'none',
        };
      case 'domain':
        return {
          background: domainColor ? `${domainColor}08` : 'var(--bg-white, #ffffff)',
          border: `1px solid ${domainColor ? `${domainColor}33` : 'var(--border-light, #e2e8f0)'}`,
          boxShadow: domainColor ? `0 4px 14px ${domainColor}15` : '0 1px 3px rgba(0,0,0,0.05)',
        };
      case 'default':
      default:
        return {
          background: 'var(--bg-white, #ffffff)',
          border: '1px solid var(--border-light, #e2e8f0)',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
        };
    }
  };

  return (
    <div
      className={`the-card ${className}`}
      style={{
        borderRadius: '12px',
        padding: paddingMap[padding],
        fontFamily: 'Inter, system-ui, sans-serif',
        transition: 'all 200ms cubic-bezier(0.4, 0, 0.2, 1)',
        cursor: interactive ? 'pointer' : 'default',
        ...getVariantStyles(),
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
};
