import React from 'react';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  style?: React.CSSProperties;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  style = {},
}) => {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '36px 24px',
        textAlign: 'center',
        fontFamily: 'Inter, system-ui, sans-serif',
        ...style,
      }}
    >
      {icon && (
        <div
          style={{
            fontSize: '32px',
            marginBottom: '12px',
            opacity: 0.8,
          }}
        >
          {icon}
        </div>
      )}
      <h4
        style={{
          margin: '0 0 6px 0',
          fontSize: '15px',
          fontWeight: 600,
          color: 'var(--text-primary, #0f172a)',
        }}
      >
        {title}
      </h4>
      {description && (
        <p
          style={{
            margin: '0 0 16px 0',
            fontSize: '13px',
            color: 'var(--text-muted, #64748b)',
            maxWidth: '320px',
            lineHeight: 1.4,
          }}
        >
          {description}
        </p>
      )}
      {action && <div>{action}</div>}
    </div>
  );
};
