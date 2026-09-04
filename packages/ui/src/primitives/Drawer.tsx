import React, { useEffect } from 'react';

export interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  position?: 'right' | 'left' | 'bottom';
  width?: string;
  footer?: React.ReactNode;
}

export const Drawer: React.FC<DrawerProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  position = 'right',
  width = '380px',
  footer,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        justifyContent:
          position === 'right' ? 'flex-end' : position === 'left' ? 'flex-start' : 'center',
        alignItems: position === 'bottom' ? 'flex-end' : 'stretch',
      }}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.35)',
          backdropFilter: 'blur(2px)',
          animation: 'fadeIn 150ms ease-out',
        }}
      />

      {/* Drawer Panel */}
      <aside
        role="dialog"
        aria-modal="true"
        style={{
          position: 'relative',
          zIndex: 51,
          width: position === 'bottom' ? '100%' : width,
          maxHeight: position === 'bottom' ? '80vh' : '100vh',
          height: position === 'bottom' ? 'auto' : '100%',
          background: 'var(--bg-white, #ffffff)',
          boxShadow: '-4px 0 24px rgba(0, 0, 0, 0.15)',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: 'Inter, system-ui, sans-serif',
          animation:
            position === 'right'
              ? 'slideInRight 200ms cubic-bezier(0.16, 1, 0.3, 1)'
              : 'slideInBottom 200ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Header */}
        <header
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-light, #e2e8f0)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg-page, #f8fafc)',
          }}
        >
          <div>
            {title && (
              <h3
                style={{
                  margin: 0,
                  fontSize: '15px',
                  fontWeight: 600,
                  color: 'var(--text-primary, #0f172a)',
                }}
              >
                {title}
              </h3>
            )}
            {subtitle && (
              <p
                style={{
                  margin: '2px 0 0 0',
                  fontSize: '12px',
                  color: 'var(--text-muted, #64748b)',
                }}
              >
                {subtitle}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close drawer"
            style={{
              background: 'transparent',
              border: 'none',
              padding: '6px',
              borderRadius: '6px',
              cursor: 'pointer',
              color: 'var(--text-muted, #64748b)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              outline: 'none',
            }}
          >
            ✕
          </button>
        </header>

        {/* Content Body */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '20px',
          }}
        >
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <footer
            style={{
              padding: '14px 20px',
              borderTop: '1px solid var(--border-light, #e2e8f0)',
              background: 'var(--bg-page, #f8fafc)',
            }}
          >
            {footer}
          </footer>
        )}
      </aside>
    </div>
  );
};
