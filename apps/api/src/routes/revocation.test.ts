import { sign } from 'hono/jwt';
import { describe, expect, it } from 'vitest';

import { tokenRevocationStore } from '@the-visualizer/contracts';

import app from '../index.js';

describe('JWT Token Revocation & Session Invalidation', () => {
  const secret = process.env.JWT_SECRET || '01234567890123456789012345678901';

  it('rejects subsequent requests once a token is added to the revocation store', async () => {
    tokenRevocationStore.clear();

    const payload = {
      id: 'revoked-user-1',
      email: 'revoked@example.com',
      name: 'Revoked User',
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const token = await sign(payload, secret);

    // Initial state: token is not revoked
    expect(await tokenRevocationStore.isRevoked(token)).toBe(false);

    // Explicitly revoke token
    await tokenRevocationStore.revoke(token, 3600);
    expect(await tokenRevocationStore.isRevoked(token)).toBe(true);

    // Request to protected endpoint with revoked token must fail with 401
    const res = await app.request('/topologies', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        orgId: '12345678-1234-1234-1234-123456789012',
        name: 'Test Topology',
        definition: {},
      }),
    });

    expect(res.status).toBe(401);
    const body = (await res.json()) as any;
    expect(body.error?.code).toBe('UNAUTHORIZED');
  });

  it('revokes tokens via the /auth/revoke endpoint', async () => {
    tokenRevocationStore.clear();

    const payload = {
      id: 'revoked-user-2',
      email: 'revoked2@example.com',
      name: 'Revoked User 2',
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const token = await sign(payload, secret);

    // Call /auth/revoke
    const revokeRes = await app.request('/auth/revoke', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token }),
    });

    expect(revokeRes.status).toBe(200);
    expect(await tokenRevocationStore.isRevoked(token)).toBe(true);
  });
});
