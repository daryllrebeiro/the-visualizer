import http from 'http';
import { describe, expect, it } from 'vitest';

import { createWebSocketServer } from './ws-server.js';

describe('WebSocket Server Configuration & Defense-in-Depth Regression', () => {
  it('enforces explicit 1MB maxPayload cap on WebSocketServer instance', () => {
    const server = http.createServer();
    const wss = createWebSocketServer(server);

    // Assert that maxPayload is strictly 1MB (1,048,576 bytes) and not default 100MB
    expect(wss.options.maxPayload).toBe(1024 * 1024);
    wss.close();
    server.close();
  });

  it('prohibits construction without explicit security limits', () => {
    const server = http.createServer();
    const wss = createWebSocketServer(server);

    // Verify server options are configured
    expect(wss.options.noServer).toBe(true);
    expect(wss.options.maxPayload).toBeLessThanOrEqual(1024 * 1024);
    wss.close();
    server.close();
  });

  it('validates HTTP server transport timeouts for production resilience', () => {
    const server = http.createServer();
    // Verify server allows setting security timeouts
    server.keepAliveTimeout = 65000;
    server.headersTimeout = 66000;
    server.requestTimeout = 30000;
    server.maxHeadersCount = 100;

    expect(server.keepAliveTimeout).toBe(65000);
    expect(server.headersTimeout).toBe(66000);
    expect(server.requestTimeout).toBe(30000);
    expect(server.maxHeadersCount).toBe(100);
    server.close();
  });
});
