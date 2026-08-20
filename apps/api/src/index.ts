import './otel-init.js';

import { register } from '@the-visualizer/logging';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';

import { config } from './config.js';
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
if (process.env.NODE_ENV !== 'test') {
  console.log(`🚀 Stateless REST API listening on port ${config.PORT}`);
}

export default app;
