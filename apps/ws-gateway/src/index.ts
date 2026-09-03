import './otel-init.js';

import * as http from 'http';

import { initGlobalExceptionHandling, logger, register } from '@the-visualizer/logging';

initGlobalExceptionHandling('ws-gateway');

import { config } from './config.js';
import { roomManager } from './gateway/room-manager.js';
import { simulationRunner } from './gateway/runner.js';
import { createWebSocketServer } from './gateway/ws-server.js';

const server = http.createServer((req, res) => {
  if (req.url === '/metrics') {
    res.writeHead(200, {
      'Content-Type': register.contentType,
      'X-Frame-Options': 'DENY',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
    });
    register
      .metrics()
      .then((metricsText: string) => {
        res.end(metricsText);
      })
      .catch((err: unknown) => {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(String(err));
      });
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/plain',
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  });
  res.end('WebSocket Gateway Health OK\n');
});

// Explicit HTTP server hardening timeouts (prevent slowloris and idle socket exhaustion)
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
server.requestTimeout = 30000;
server.maxHeadersCount = 100;

// Bind ws.Server upgrade handlers to HTTP server
const wss = createWebSocketServer(server);

if (process.env.NODE_ENV !== 'test') {
  server.listen(config.PORT, () => {
    logger.info(`🚀 WebSocket Realtime Gateway listening on port ${String(config.PORT)}`);
  });
}

// Graceful Shutdown
async function handleShutdown(signal: string): Promise<void> {
  logger.info(`Received ${signal}. Shutting down WebSocket gateway gracefully...`);

  // 1. Close HTTP Server (stop accepting new connections/upgrades)
  server.close(() => {
    logger.info('HTTP server closed to new connections.');
  });

  // 2. Notify and drain all WebSocket client sockets with close code 1001 (Going Away)
  wss.clients.forEach((client) => {
    if (client.readyState === 1 /* OPEN */) {
      client.close(1001, 'Server shutting down gracefully');
    }
  });

  // 3. Allow 500ms drain window before forceful termination
  await new Promise((resolve) => setTimeout(resolve, 500));

  wss.clients.forEach((client) => {
    client.terminate();
  });
  wss.close(() => {
    logger.info('WebSocket Server closed.');
  });

  // 4. Close simulation runner tick loops and Redis connection
  await simulationRunner.close();
  // 5. Quit Redis client pools
  await roomManager.close();
  logger.info('Redis connections closed.');

  process.exit(0);
}

process.on('SIGINT', () => {
  void handleShutdown('SIGINT');
});
process.on('SIGTERM', () => {
  void handleShutdown('SIGTERM');
});

export { wss, server };
