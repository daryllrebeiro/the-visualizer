import client, { type Counter } from 'prom-client';
import { logger } from './index.js';
import { register } from './metrics.js';

export const appUncaughtExceptionsTotal: Counter =
  (register.getSingleMetric('app_uncaught_exceptions_total') as Counter) ??
  new client.Counter({
    name: 'app_uncaught_exceptions_total',
    help: 'Total count of uncaught exceptions and unhandled promise rejections',
    labelNames: ['service', 'error_type'],
    registers: [register],
  });

export interface ErrorContext {
  roomId?: string | undefined;
  userId?: string | undefined;
  service?: string | undefined;
  extra?: Record<string, unknown> | undefined;
}

export type ErrorReporter = (err: Error, context?: ErrorContext) => void;

let externalReporter: ErrorReporter | null = null;

export function setExternalErrorReporter(reporter: ErrorReporter): void {
  externalReporter = reporter;
}

/**
 * Centrally captures, enriches, logs, and forwards exceptions to monitoring systems.
 */
export function captureException(err: unknown, context: ErrorContext = {}): void {
  const errorObj = err instanceof Error ? err : new Error(String(err));
  const service = context.service ?? 'the-visualizer';

  appUncaughtExceptionsTotal.inc({
    service,
    error_type: errorObj.name || 'Error',
  });

  logger.error(
    {
      err: errorObj,
      roomId: context.roomId,
      userId: context.userId,
      extra: context.extra,
      service,
    },
    `[Exception Captured] ${errorObj.message}`,
  );

  if (externalReporter) {
    try {
      externalReporter(errorObj, context);
    } catch {
      // Avoid failing if external error reporter throws
    }
  }
}

/**
 * Initializes global process-level uncaught exception and unhandled rejection handlers.
 */
export function initGlobalExceptionHandling(serviceName: string): void {
  process.on('uncaughtException', (err: Error) => {
    captureException(err, { service: serviceName, extra: { type: 'uncaughtException' } });
  });

  process.on('unhandledRejection', (reason: unknown) => {
    captureException(reason, { service: serviceName, extra: { type: 'unhandledRejection' } });
  });
}
