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
  copied?: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      copied: false,
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
    this.setState({ hasError: false, error: null, errorInfo: null, copied: false });
    this.props.onReset?.();
  };

  handleDownloadCrashBundle = (): void => {
    try {
      const bundle = {
        version: '1.0',
        generatedAt: new Date().toISOString(),
        title: this.props.fallbackTitle ?? 'Visualizer Render Crash',
        error: {
          name: this.state.error?.name ?? 'Error',
          message: this.state.error?.message ?? 'Unknown Exception',
          stack: this.state.error?.stack ?? '',
        },
        componentStack: this.state.errorInfo?.componentStack ?? '',
        environment: {
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'server',
          platform: typeof navigator !== 'undefined' ? navigator.platform : 'server',
          timestamp: Date.now(),
        },
      };

      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `visualizer-crash-bundle-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Failed to export crash bundle:', e);
    }
  };

  handleCopyDiagnostic = (): void => {
    const text = `Visualizer Error: ${this.state.error?.message ?? 'Unknown'}\nStack: ${this.state.error?.stack ?? ''}\nComponent: ${this.state.errorInfo?.componentStack ?? ''}`;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        this.setState({ copied: true });
        setTimeout(() => this.setState({ copied: false }), 2500);
      });
    }
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
              underlying simulation engine remains safe and deterministic.
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
                textAlign: 'left',
              }}
            >
              <strong>{this.state.error.name}:</strong> {this.state.error.message}
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px', marginTop: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
            <button
              type="button"
              onClick={this.handleReset}
              className="btn btn--primary"
              style={{
                backgroundColor: '#38bdf8',
                color: '#0f172a',
                fontWeight: 700,
                padding: '8px 16px',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              🔄 Reload Visualizer
            </button>

            <button
              type="button"
              onClick={this.handleDownloadCrashBundle}
              className="btn btn--secondary"
              style={{
                backgroundColor: '#1e293b',
                color: '#f8fafc',
                border: '1px solid #334155',
                padding: '8px 14px',
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.85rem',
              }}
              title="Download sanitized JSON crash diagnostic bundle"
            >
              📥 Download Crash Bundle
            </button>

            <button
              type="button"
              onClick={this.handleCopyDiagnostic}
              className="btn btn--ghost"
              style={{
                padding: '8px 14px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.85rem',
              }}
            >
              {this.state.copied ? '✅ Copied Diagnostic' : '📋 Copy Diagnostic'}
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
