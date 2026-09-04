import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { describe, expect, it } from 'vitest';

describe('API CORS Security & Origin Whitelist', () => {
  const app = new Hono();

  app.use(
    '*',
    cors({
      origin: (origin) => {
        if (!origin) return undefined;
        if (
          origin.startsWith('http://localhost:') ||
          origin.startsWith('https://localhost:') ||
          origin.startsWith('http://127.0.0.1:')
        ) {
          return origin;
        }
        const allowedEnv = process.env.ALLOWED_ORIGINS
          ? process.env.ALLOWED_ORIGINS.split(',').map((s) => s.trim())
          : [];
        if (allowedEnv.includes(origin) || origin.endsWith('.run.app')) {
          return origin;
        }
        return null;
      },
      allowHeaders: ['Content-Type', 'Authorization'],
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      credentials: true,
    }),
  );

  app.get('/test-cors', (c) => c.json({ ok: true }));

  it('rejects unauthorized arbitrary origins from evil.example.com', async () => {
    const res = await app.request('/test-cors', {
      method: 'GET',
      headers: {
        Origin: 'https://evil.example.com',
      },
    });

    const allowOrigin = res.headers.get('Access-Control-Allow-Origin');
    expect(allowOrigin).toBeNull();
  });

  it('allows authorized localhost origins with credentials', async () => {
    const res = await app.request('/test-cors', {
      method: 'GET',
      headers: {
        Origin: 'http://localhost:3000',
      },
    });

    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:3000');
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');
  });

  it('allows authorized Cloud Run production domains', async () => {
    const res = await app.request('/test-cors', {
      method: 'GET',
      headers: {
        Origin: 'https://the-visualizer-frontend.run.app',
      },
    });

    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(
      'https://the-visualizer-frontend.run.app',
    );
  });
});
