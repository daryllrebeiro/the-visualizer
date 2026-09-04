import { describe, expect, it } from 'vitest';

import { createLogger, logger, withTraceContext } from './index.js';

describe('Structured Logger & Redaction', () => {
  it('instantiates logger with default levels and serializer configs', () => {
    const testLog = createLogger('test-service');
    expect(testLog).toBeDefined();
    expect(testLog.level).toBeDefined();
  });

  it('provides global singleton logger', () => {
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.error).toBe('function');
  });

  it('supports trace context injection without crashing', () => {
    const enriched = withTraceContext(logger);
    expect(enriched).toBeDefined();
    expect(typeof enriched.info).toBe('function');
  });
});
