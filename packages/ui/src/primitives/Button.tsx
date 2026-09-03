import React from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'domain';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant | undefined;
  size?: ButtonSize | undefined;
  domainColor?: string | undefined;
  icon?: React.ReactNode | undefined;
  iconPosition?: 'left' | 'right' | undefined;
  isLoading?: boolean | undefined;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'secondary',
  size = 'md',
  domainColor,
  icon,
  iconPosition = 'left',
  isLoading = false,
  className = '',
  disabled,
  style = {},
  ...props
}) => {
  const sizeStyles: Record<ButtonSize, React.CSSProperties> = {
    sm: { padding: '5px 10px', fontSize: '12px', borderRadius: '6px', gap: '6px' },
    md: { padding: '8px 14px', fontSize: '13px', borderRadius: '8px', gap: '8px' },
    lg: { padding: '10px 18px', fontSize: '14px', borderRadius: '10px', gap: '10px' },
  };

  const getVariantStyles = (): React.CSSProperties => {
    switch (variant) {
      case 'primary':
        return {
          background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
          color: '#ffffff',
          border: '1px solid #1d4ed8',
          boxShadow: '0 2px 8px rgba(37, 99, 235, 0.3)',
        };
      case 'domain':
        return {
          background: domainColor
            ? `linear-gradient(135deg, ${domainColor} 0%, ${domainColor}dd 100%)`
            : '#10b981',
          color: '#ffffff',
          border: `1px solid ${domainColor ?? '#10b981'}`,
          boxShadow: `0 2px 8px ${domainColor ? `${domainColor}44` : 'rgba(16, 185, 129, 0.3)'}`,
        };
      case 'danger':
        return {
          background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
          color: '#ffffff',
          border: '1px solid #b91c1c',
          boxShadow: '0 2px 8px rgba(220, 38, 38, 0.25)',
        };
      case 'outline':
        return {
          background: 'transparent',
          color: 'var(--text-primary, #0f172a)',
          border: '1px solid var(--border-medium, #cbd5e1)',
        };
      case 'ghost':
        return {
          background: 'transparent',
          color: 'var(--text-primary, #0f172a)',
          border: '1px solid transparent',
        };
      case 'secondary':
      default:
        return {
          background: 'var(--bg-white, #ffffff)',
          color: 'var(--text-primary, #0f172a)',
          border: '1px solid var(--border-light, #e2e8f0)',
          boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
        };
    }
  };

  return (
    <button
      className={`the-btn ${className}`}
      disabled={disabled || isLoading}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'Inter, system-ui, sans-serif',
        fontWeight: 600,
        cursor: disabled || isLoading ? 'not-allowed' : 'pointer',
        opacity: disabled || isLoading ? 0.6 : 1,
        transition: 'all 150ms cubic-bezier(0.4, 0, 0.2, 1)',
        outline: 'none',
        ...sizeStyles[size],
        ...getVariantStyles(),
        ...style,
      }}
      {...props}
    >
      {isLoading ? (
        <>
          <span
            aria-hidden="true"
            style={{
              width: '14px',
              height: '14px',
              border: '2px solid currentColor',
              borderRightColor: 'transparent',
              borderRadius: '50%',
              animation: 'spin 0.6s linear infinite',
            }}
          />
          <span>{children}</span>
        </>
      ) : (
        <>
          {icon && iconPosition === 'left' && <span style={{ display: 'inline-flex' }}>{icon}</span>}
          {children}
          {icon && iconPosition === 'right' && <span style={{ display: 'inline-flex' }}>{icon}</span>}
        </>
      )}
    </button>
  );
};
