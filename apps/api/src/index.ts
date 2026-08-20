import './otel-init.js';

import { serve } from '@hono/node-server';
import { register } from '@the-visualizer/logging';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';

import { config } from './config.js';
import { pool } from './db/index.js';
import { redis } from './db/redis.js';
import { authenticate } from './middleware/auth.middleware.js';
import { requestLogger } from './middleware/logging.middleware.js';
import { rateLimiter } from './middleware/rate-limiter.js';
import { authRouter } from './routes/auth.routes.js';
import { orgRouter } from './routes/org.routes.js';
import { topologyRouter } from './routes/topology.routes.js';

const app = new Hono();

// 1. Global Middlewares
app.use('*', secureHeaders());
app.use('*', rateLimiter({ limit: 60, refillRate: 1 }));
app.use('*', requestLogger());

app.use(
  '*',
  cors({
    origin: (origin) => {
      // Allow local development ports or any configured origin
      if (!origin) return '*';
      if (origin.startsWith('http://localhost:') || origin.startsWith('https://localhost:')) {
        return origin;
      }
      return '*';
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
    }
  );

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
