import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import type { Server as HttpServer } from 'node:http';

import { tokenRevocationStore } from '@the-visualizer/contracts';
import { captureException, initGlobalExceptionHandling, register } from '@the-visualizer/logging';

import { config } from './config.js';
import { pool } from './db/index.js';
import { redis } from './db/redis.js';
import { authenticate } from './middleware/auth.middleware.js';
import { requestLogger } from './middleware/logging.middleware.js';
import { rateLimiter } from './middleware/rate-limiter.js';
import './otel-init.js';
import { authRouter } from './routes/auth.routes.js';
import { orgRouter } from './routes/org.routes.js';
import { topologyRouter } from './routes/topology.routes.js';

initGlobalExceptionHandling('api');

tokenRevocationStore.setBackend(redis);

const app = new Hono();

// Centralized error handler
app.onError((err, c) => {
  const userId = c.get('userId' as never) as string | undefined;
  captureException(err, {
    service: 'api',
    userId,
    extra: { path: c.req.path, method: c.req.method },
  });
  return c.json(
    {
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: process.env.NODE_ENV === 'production' ? 'An internal error occurred' : err.message,
      },
    },
    500,
  );
});

// 1. Global Middlewares
app.use('*', secureHeaders());
if (process.env.NODE_ENV !== 'test') {
  app.use('*', rateLimiter({ limit: 60, refillRate: 1 }));
}
app.use('*', requestLogger());

app.use(
  '*',
  cors({
    origin: (origin) => {
      if (!origin) return undefined;
      // Allow localhost dev ports
      if (
        origin.startsWith('http://localhost:') ||
        origin.startsWith('https://localhost:') ||
        origin.startsWith('http://127.0.0.1:')
      ) {
        return origin;
      }
      // Allow Cloud Run and configured production domains
      const allowedEnv = process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(',').map((s) => s.trim())
        : [];
      if (allowedEnv.includes(origin) || origin.endsWith('.run.app')) {
        return origin;
      }
      // Reject any unlisted/arbitrary origin
      return null;
    },
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
  }),
);

// Run global authentication middleware to extract and verify session headers/cookies
app.use('*', authenticate);

// 2. Route Endpoints
app.get('/health', (c) => {
  return c.json({
    status: 'UP',
    service: 'api',
    timestamp: new Date().toISOString(),
  });
});

app.get('/metrics', async (c) => {
  c.header('Content-Type', register.contentType);
  return c.text(await register.metrics());
});

app.route('/auth', authRouter);
app.route('/orgs', orgRouter);
app.route('/topologies', topologyRouter);

// 3. Port startup bindings when executed directly
let server: ReturnType<typeof serve> | undefined;

if (process.env.NODE_ENV !== 'test') {
  server = serve(
    {
      fetch: app.fetch,
      port: config.PORT,
    },
    (info) => {
      console.log(`🚀 Stateless REST API listening on port ${info.port}`);
    },
  );

  // Explicit HTTP transport timeouts (prevent slowloris and resource starvation)
  const httpServer = server as HttpServer;
  httpServer.keepAliveTimeout = 65000;
  httpServer.headersTimeout = 66000;
  httpServer.requestTimeout = 30000;
  httpServer.maxHeadersCount = 100;

  const handleShutdown = (signal: string) => {
    console.log(`Received ${signal}. Shutting down API server gracefully...`);
    if (server) {
      server.close(() => {
        console.log('HTTP server closed.');
        (async () => {
          try {
            await pool.end();
            console.log('PostgreSQL connection pool closed.');
          } catch (err) {
            console.error('Error closing PostgreSQL pool:', err);
          }
          try {
            await redis.quit();
            console.log('Redis client connection closed.');
          } catch (err) {
            console.error('Error closing Redis client:', err);
          }
          console.log('All resources released. Exiting.');
          process.exit(0);
        })().catch((err: unknown) => {
          console.error('Error during graceful resource cleanup:', err);
          process.exit(1);
        });
      });

      // Force exit after 10 seconds if graceful shutdown hangs
      setTimeout(() => {
        console.error('Graceful shutdown timed out. Forcing process exit.');
        process.exit(1);
      }, 10000);
    } else {
      process.exit(0);
    }
  };

  process.on('SIGTERM', () => {
    handleShutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    handleShutdown('SIGINT');
  });
}

export default app;
