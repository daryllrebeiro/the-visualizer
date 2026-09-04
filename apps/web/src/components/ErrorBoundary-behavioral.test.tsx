// @vitest-environment jsdom
import React from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

import { ErrorBoundary } from './ErrorBoundary';

function CrashingCanvas({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('DELIBERATE_CANVAS_CRASH_TEST');
  }
  return <div data-testid="active-canvas">Normal Canvas Rendered</div>;
}

describe('ErrorBoundary Behavioral Verification', () => {
  it('catches deliberate canvas render crash, keeps app shell usable, and resumes on reset', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    let shouldThrow = true;
    const renderApp = () => {
      root.render(
        <div data-testid="app-shell">
          <header data-testid="app-header">Header Usable</header>
          <ErrorBoundary fallbackTitle="DATABASE Visualizer Fault">
            <CrashingCanvas shouldThrow={shouldThrow} />
          </ErrorBoundary>
          <aside data-testid="app-sidebar">Sidebar Usable</aside>
        </div>,
      );
    };

    // 1. Initial render with deliberate crash
    await React.act(async () => {
      renderApp();
    });

    // Assert app shell remains mounted and usable
    expect(container.querySelector('[data-testid="app-header"]')?.textContent).toBe(
      'Header Usable',
    );
    expect(container.querySelector('[data-testid="app-sidebar"]')?.textContent).toBe(
      'Sidebar Usable',
    );

    // Assert ErrorBoundary caught the error and rendered fallback UI
    const boundaryElem = container.querySelector('[role="alert"]');
    expect(boundaryElem).not.toBeNull();
    expect(boundaryElem?.textContent).toContain('DATABASE Visualizer Fault');
    expect(boundaryElem?.textContent).toContain('DELIBERATE_CANVAS_CRASH_TEST');

    // 2. Revert deliberate throw and trigger reset
    shouldThrow = false;
    const resetButton = container.querySelector('button.btn--primary') as HTMLButtonElement;
    expect(resetButton).not.toBeNull();
    expect(resetButton.textContent).toContain('Reload Visualizer');
    await React.act(async () => {
      resetButton.click();
      renderApp();
    });

    // Assert normal canvas rendering resumes
    expect(container.querySelector('[data-testid="active-canvas"]')?.textContent).toBe(
      'Normal Canvas Rendered',
    );
    expect(container.querySelector('[role="alert"]')).toBeNull();

    consoleSpy.mockRestore();
    root.unmount();
    container.remove();
  });
});
