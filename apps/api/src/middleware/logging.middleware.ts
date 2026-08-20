import * as crypto from 'crypto';
import { createLogger, withTraceContext, type Logger } from '@the-visualizer/logging';
import { httpRequestsTotal, httpRequestDurationSeconds } from '@the-visualizer/logging';
import type { MiddlewareHandler } from 'hono';
import { routePath } from 'hono/route';

declare module 'hono' {
  interface ContextVariableMap {
    logger: Logger;
  }
}

/**
 * Hono middleware to generate Request IDs, trace correlation context,
 * structured JSON logging, and API request metrics.
 */
export const requestLogger = (): MiddlewareHandler => {
  const baseLogger = createLogger('api-server');

  return async (c, next) => {
    const startTime = performance.now();
    const requestId = c.req.header('x-request-id') || crypto.randomUUID();

    // Enrich logger with OTel trace/span context
    let logger = withTraceContext(baseLogger);

    // Create a child logger scoped for this request
    logger = logger.child({
      requestId,
      method: c.req.method,
      path: c.req.path,
    });

    c.set('logger', logger);
    c.header('x-request-id', requestId);

    await next();

    const durationMs = performance.now() - startTime;
    const durationSec = durationMs / 1000;
    const status = c.res.status;
    
    // Use Hono's matched route path template (e.g., /topologies/:id) to prevent metric cardinality explosion
    const route = routePath(c) || c.req.path;

    // Track Prometheus HTTP metrics
    httpRequestsTotal.inc({
      method: c.req.method,
      route,
      status: String(status),
    });

    httpRequestDurationSeconds.observe(
      {
        method: c.req.method,
        route,
        status: String(status),
      },
      durationSec,
    );

    const user = c.get('user');
    const logPayload = {
      status,
      durationMs,
      userId: user?.id,
      route,
    };

    if (status >= 500) {
      logger.error(logPayload, `HTTP ${c.req.method} ${c.req.path} - Server Error`);
    } else if (status >= 400) {
      logger.warn(logPayload, `HTTP ${c.req.method} ${c.req.path} - Client Error`);
    } else {
      logger.info(logPayload, `HTTP ${c.req.method} ${c.req.path} - Success`);
    }
  };
};
