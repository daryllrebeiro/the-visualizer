#!/usr/bin/env node

/**
 * TheVisualizer — Production Replit Ingress Reverse Proxy
 * Zero-dependency, high-performance Node.js HTTP/WebSocket reverse proxy.
 *
 * Routes:
 *  - /deployment-health, /healthz          -> Instant 200 OK health check
 *  - /ws, Upgrade: websocket                -> WS Gateway (port 3001)
 *  - /api/*, /auth/*, /orgs/*, /topologies/*,
 *    /health, /metrics                      -> Stateless API (port 3000)
 *  - /* (all other paths)                   -> Next.js Web (port 3002)
 */

import http from 'node:http';
import net from 'node:net';

const PROXY_PORT = Number(process.env.PROXY_PORT || process.env.PORT || 8080);
const PROXY_HOST = process.env.PROXY_HOST || '0.0.0.0';

const API_PORT = Number(process.env.API_PORT || 3000);
const WS_PORT = Number(process.env.WS_GATEWAY_PORT || 3001);
const WEB_PORT = Number(process.env.WEB_PORT || 3002);

const TARGET_HOST = '127.0.0.1';

// Standard Hardened Security Headers
function applySecurityHeaders(res, isHttps = false) {
  if (!res.hasHeader('X-Content-Type-Options')) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
  }
  if (!res.hasHeader('X-Frame-Options')) {
    res.setHeader('X-Frame-Options', 'DENY');
  }
  if (!res.hasHeader('Referrer-Policy')) {
    res.setHeader('Referrer-Policy', 'no-referrer');
  }
  if (isHttps && !res.hasHeader('Strict-Transport-Security')) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
}

const server = http.createServer((req, res) => {
  const isHttps = req.headers['x-forwarded-proto'] === 'https';
  const url = req.url || '/';

  // 1. Fast, immediate health checks for Replit deployment monitors
  if (url === '/deployment-health' || url === '/healthz') {
    applySecurityHeaders(res, isHttps);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: 'UP',
        service: 'replit-reverse-proxy',
        timestamp: new Date().toISOString(),
        targets: {
          api: `http://${TARGET_HOST}:${API_PORT}`,
          ws: `http://${TARGET_HOST}:${WS_PORT}`,
          web: `http://${TARGET_HOST}:${WEB_PORT}`,
        },
      }),
    );
    return;
  }

  // 2. Determine target backend port and path rewrite
  let targetPort = WEB_PORT;
  let targetPath = url;

  if (url.startsWith('/api/')) {
    targetPort = API_PORT;
    targetPath = url.slice(4); // strip '/api' prefix: e.g. /api/auth/dev-login -> /auth/dev-login
  } else if (
    url.startsWith('/auth') ||
    url.startsWith('/orgs') ||
    url.startsWith('/topologies') ||
    url === '/health' ||
    url === '/metrics'
  ) {
    targetPort = API_PORT;
  } else if (url === '/ws' || url.startsWith('/ws?')) {
    targetPort = WS_PORT;
  }

  // 3. Prepare proxy request headers
  const forwardHeaders = { ...req.headers };
  const clientIp = req.socket.remoteAddress || '127.0.0.1';
  forwardHeaders['x-forwarded-for'] = req.headers['x-forwarded-for']
    ? `${req.headers['x-forwarded-for']}, ${clientIp}`
    : clientIp;
  forwardHeaders['x-forwarded-host'] = req.headers['host'] || 'localhost';
  forwardHeaders['x-forwarded-proto'] = req.headers['x-forwarded-proto'] || 'http';

  const proxyReq = http.request(
    {
      host: TARGET_HOST,
      port: targetPort,
      path: targetPath,
      method: req.method,
      headers: forwardHeaders,
    },
    (proxyRes) => {
      // Forward status and headers
      applySecurityHeaders(res, isHttps);
      res.writeHead(proxyRes.statusCode || 200, proxyRes.statusMessage, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );

  proxyReq.on('error', (err) => {
    if (!res.headersSent) {
      applySecurityHeaders(res, isHttps);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: 'Bad Gateway',
          message: `Unable to connect to upstream service on port ${targetPort}: ${err.message}`,
          targetPort,
        }),
      );
    }
  });

  req.pipe(proxyReq);
});

// 4. WebSocket Upgrade Proxying (pipe duplex streams to WS Gateway)
server.on('upgrade', (req, socket, head) => {
  const targetPort = WS_PORT;

  const proxySocket = net.connect(
    {
      host: TARGET_HOST,
      port: targetPort,
    },
    () => {
      // Reconstruct initial HTTP Upgrade handshake request
      let rawUpgradeRequest = `${req.method} ${req.url} HTTP/1.1\r\n`;
      const clientIp = socket.remoteAddress || '127.0.0.1';

      for (const [key, value] of Object.entries(req.headers)) {
        if (Array.isArray(value)) {
          for (const item of value) {
            rawUpgradeRequest += `${key}: ${item}\r\n`;
          }
        } else if (value !== undefined) {
          rawUpgradeRequest += `${key}: ${value}\r\n`;
        }
      }

      if (!req.headers['x-forwarded-for']) {
        rawUpgradeRequest += `x-forwarded-for: ${clientIp}\r\n`;
      }
      rawUpgradeRequest += '\r\n';

      proxySocket.write(rawUpgradeRequest);
      if (head && head.length > 0) {
        proxySocket.write(head);
      }

      // Bi-directional pipe
      proxySocket.pipe(socket);
      socket.pipe(proxySocket);
    },
  );

  proxySocket.on('error', (err) => {
    socket.destroy(err);
  });

  socket.on('error', (err) => {
    proxySocket.destroy(err);
  });
});

server.listen(PROXY_PORT, PROXY_HOST, () => {
  console.log(`\x1b[36m[replit-reverse-proxy]\x1b[0m Listening on http://${PROXY_HOST}:${PROXY_PORT}`);
  console.log(`\x1b[36m[replit-reverse-proxy]\x1b[0m Routing rules:`);
  console.log(`  • /deployment-health, /healthz       -> Instant HTTP 200`);
  console.log(`  • /api/*, /auth, /orgs, /topologies -> API (127.0.0.1:${API_PORT})`);
  console.log(`  • /ws, Upgrade: websocket            -> WS Gateway (127.0.0.1:${WS_PORT})`);
  console.log(`  • /* (UI & Next.js routes)           -> Web (127.0.0.1:${WEB_PORT})`);
});

// Graceful termination
const shutdown = (signal) => {
  console.log(`\x1b[36m[replit-reverse-proxy]\x1b[0m Received ${signal}. Closing proxy server...`);
  server.close(() => {
    console.log(`\x1b[36m[replit-reverse-proxy]\x1b[0m Closed.`);
    process.exit(0);
  });
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
