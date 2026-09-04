import { describe, expect, it } from 'vitest';

import { ErrorBoundary } from './ErrorBoundary';

describe('Canvas ErrorBoundary Component', () => {
  it('instantiates cleanly and derives state from caught error', () => {
    const error = new Error('Simulated visualizer render explosion');
    const derivedState = ErrorBoundary.getDerivedStateFromError(error);

    expect(derivedState.hasError).toBe(true);
    expect(derivedState.error).toBe(error);
  });

  it('resets error state when handleReset is triggered', () => {
    let resetCalled = false;
    const boundary = new ErrorBoundary({
      children: null,
      onReset: () => {
        resetCalled = true;
      },
    });
    (
      boundary as unknown as { updater: { enqueueSetState: (_inst: unknown, p: unknown) => void } }
    ).updater = {
      enqueueSetState: (_inst: unknown, p: unknown) => {
        Object.assign(boundary.state, p);
      },
    };

    // Simulate error state
    boundary.state = {
      hasError: true,
      error: new Error('Render fault'),
      errorInfo: null,
    };

    boundary.handleReset();

    expect(boundary.state.hasError).toBe(false);
    expect(boundary.state.error).toBeNull();
    expect(resetCalled).toBe(true);
  });
});
