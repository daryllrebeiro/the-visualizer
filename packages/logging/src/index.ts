import { type Span, trace } from '@opentelemetry/api';
import pino from 'pino';

/**
 * Create a structured logger for a given service/component.
 *
 * In production: JSON output (pino default) → log aggregator
 * In development: pretty-printed via pino-pretty
 *
 * Rules:
 * - NEVER log secrets, tokens, passwords, or PII
 * - ALWAYS include requestId, userId, sessionId where available
 * - Use 'warn'/'error' levels for operational issues only
 */
export function createLogger(name: string): pino.Logger {
  return pino({
    name,
    level: process.env.LOG_LEVEL ?? 'info',
    serializers: {
      err: pino.stdSerializers.err,
      req: pino.stdSerializers.req,
      res: pino.stdSerializers.res,
    },
    redact: {
      // Paths to automatically redact from logs
      paths: [
        'password',
        'token',
        'accessToken',
        'refreshToken',
        'secret',
        'apiKey',
        'authorization',
        '*.password',
        '*.token',
        '*.secret',
        'req.headers.authorization',
        'req.headers.cookie',
      ],
      censor: '[REDACTED]',
    },
    formatters: {
      level: (label: string) => ({ level: label }),
    },
  });
}

export type Logger = pino.Logger;

/**
 * Inject OpenTelemetry trace context into log fields.
 * Called once per request to enrich the logger with trace/span IDs.
 */
export function withTraceContext(logger: Logger, span?: Span): Logger {
  const activeSpan = span ?? trace.getActiveSpan();
  if (!activeSpan) return logger;

  const spanContext = activeSpan.spanContext();
  return logger.child({
    traceId: spanContext.traceId,
    spanId: spanContext.spanId,
  });
}

// Default application logger
export const logger = createLogger('the-visualizer');
