import * as http from 'http';

import { logger } from '@the-visualizer/logging';

import { config } from './config.js';
import { roomManager } from './gateway/room-manager.js';
import { createWebSocketServer } from './gateway/ws-server.js';

const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('WebSocket Gateway Health OK\n');
});

// Bind ws.Server upgrade handlers to HTTP server
const wss = createWebSocketServer(server);

if (process.env.NODE_ENV !== 'test') {
  server.listen(config.PORT, () => {
    logger.info(`🚀 WebSocket Realtime Gateway listening on port ${config.PORT}`);
  });
}

// Graceful Shutdown
async function handleShutdown(signal: string) {
  logger.info(`Received ${signal}. Shutting down WebSocket gateway gracefully...`);

  // Close HTTP Server (drains upgrades)
  server.close(() => {
    logger.info('HTTP server closed.');
  });

  // Close all WebSocket client sockets
  wss.clients.forEach((client) => {
    client.terminate();
  });
  wss.close(() => {
    logger.info('WebSocket Server closed.');
  });

  // Quit Redis client pools
  await roomManager.close();
  logger.info('Redis connections closed.');

  process.exit(0);
}

process.on('SIGINT', () => {
  handleShutdown('SIGINT');
});
process.on('SIGTERM', () => {
  handleShutdown('SIGTERM');
});

export { wss, server };
