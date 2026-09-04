'use client';

import React, { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('💥 [ErrorBoundary] Uncaught visualizer error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReset = (): void => {
    this.state = { hasError: false, error: null, errorInfo: null };
    this.setState({ hasError: false, error: null, errorInfo: null });
    this.props.onReset?.();
  };

  override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          aria-live="assertive"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            minHeight: '350px',
            backgroundColor: '#0f172a',
            border: '2px dashed #f43f5e',
            borderRadius: '12px',
            padding: '24px',
            color: '#f8fafc',
            textAlign: 'center',
            gap: '16px',
          }}
        >
          <div style={{ fontSize: '2.5rem' }}>⚠️</div>
          <div>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '1.2rem', color: '#fda4af' }}>
              {this.props.fallbackTitle ?? 'Simulation Visualizer Error'}
            </h3>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8', maxWidth: '500px' }}>
              The active simulation visualizer encountered an unexpected render state error. The
              underlying simulation engine remains safe.
            </p>
          </div>

          {this.state.error && (
            <div
              style={{
                fontFamily: 'monospace',
                fontSize: '0.75rem',
                backgroundColor: 'rgba(244, 63, 94, 0.1)',
                border: '1px solid rgba(244, 63, 94, 0.3)',
                padding: '10px 14px',
                borderRadius: '6px',
                color: '#fecdd3',
                maxWidth: '650px',
                overflowX: 'auto',
              }}
            >
              {this.state.error.message}
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
            <button
              type="button"
              onClick={this.handleReset}
              className="btn btn--primary"
              style={{
                backgroundColor: '#38bdf8',
                color: '#0f172a',
                fontWeight: 600,
                padding: '8px 16px',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              🔄 Reload Visualizer
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
