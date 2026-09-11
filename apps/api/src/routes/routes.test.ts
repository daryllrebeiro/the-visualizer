import { sql } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { KafkaClusterState } from '@the-visualizer/contracts';

import { db } from '../db/index.js';
import app from '../index.js';

describe('Hono REST API Routing & Auth Integration Tests', () => {
  let mockKafkaState: KafkaClusterState;

  beforeAll(async () => {
    await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT`);
    mockKafkaState = {
      clusterId: 'kafka-cluster-id',
      rngState: 54321,
      brokers: {},
      topics: {},
      consumerGroups: {},
      transactions: {},
      kraft: {
        activeControllerId: null,
        voters: [],
        controllerEpoch: 0,
        metadataOffset: 0,
      },
      tick: 0,
    };
  });

  beforeEach(async () => {
    // Clear all tables to start fresh
    await db.execute(
      sql`TRUNCATE TABLE simulation_replays, topologies, memberships, organizations, users CASCADE`,
    );
  });

  it('should return UP on /health', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body).toEqual(
      expect.objectContaining({
        status: 'UP',
        service: 'api',
      }),
    );
  });

  it('should support user registration with hashed password and return tokens', async () => {
    const res = await app.request('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'alice@example.com',
        name: 'Alice Developer',
        password: 'SuperSecretPassword123!',
      }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.user.email).toBe('alice@example.com');
    expect(body.token).toBeDefined();
    expect(body.refreshToken).toBeDefined();
    expect(res.headers.get('Set-Cookie')).toContain('session_token=');
  });

  it('should reject registration if email already exists', async () => {
    await app.request('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'duplicate@example.com',
        name: 'User 1',
        password: 'Password123!',
      }),
    });

    const res2 = await app.request('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'duplicate@example.com',
        name: 'User 2',
        password: 'Password123!',
      }),
    });

    expect(res2.status).toBe(409);
    const body = (await res2.json()) as any;
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('USER_EXISTS');
  });

  it('should support login with correct password', async () => {
    await app.request('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'bob@example.com',
        name: 'Bob',
        password: 'CorrectHorseBatteryStaple123!',
      }),
    });

    const loginRes = await app.request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'bob@example.com',
        password: 'CorrectHorseBatteryStaple123!',
      }),
    });

    expect(loginRes.status).toBe(200);
    const body = (await loginRes.json()) as any;
    expect(body.success).toBe(true);
    expect(body.token).toBeDefined();
  });

  it('should reject login with wrong password (401)', async () => {
    await app.request('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'charlie@example.com',
        name: 'Charlie',
        password: 'RealPassword123!',
      }),
    });

    const loginRes = await app.request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'charlie@example.com',
        password: 'WrongPassword!',
      }),
    });

    expect(loginRes.status).toBe(401);
    const body = (await loginRes.json()) as any;
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INVALID_CREDENTIALS');
    expect(body.token).toBeUndefined();
  });

  it('should reject login with non-existent email (401)', async () => {
    const loginRes = await app.request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'nonexistent@example.com',
        password: 'AnyPassword123!',
      }),
    });

    expect(loginRes.status).toBe(401);
    const body = (await loginRes.json()) as any;
    expect(body.success).toBe(false);
    expect(body.token).toBeUndefined();
  });

  it('should enforce dev-login gating in production mode', async () => {
    const origEnv = process.env.NODE_ENV;
    const origDevFlag = process.env.ENABLE_DEV_LOGIN;

    try {
      process.env.NODE_ENV = 'production';
      delete process.env.ENABLE_DEV_LOGIN;

      const res = await app.request('/auth/dev-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'hacker@example.com', name: 'Hacker' }),
      });

      expect(res.status).toBe(403);
      const body = (await res.json()) as any;
      expect(body.error.code).toBe('FORBIDDEN');
    } finally {
      process.env.NODE_ENV = origEnv;
      process.env.ENABLE_DEV_LOGIN = origDevFlag;
    }
  });

  it('should reject unauthenticated request on protected endpoints', async () => {
    const res = await app.request('/orgs', {
      method: 'GET',
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as any;
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('should support creating organizations and listing them', async () => {
    // 1. Dev-login to get token
    const loginRes = await app.request('/auth/dev-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'owner@hono.com', name: 'Owner' }),
    });
    const { token } = (await loginRes.json()) as any;

    // 2. Create organization
    const createRes = await app.request('/orgs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        slug: 'hono-org',
        name: 'Hono Organization',
      }),
    });

    expect(createRes.status).toBe(201);
    const createBody = (await createRes.json()) as any;
    expect(createBody.success).toBe(true);
    expect(createBody.org.slug).toBe('hono-org');

    // 3. List organizations
    const listRes = await app.request('/orgs', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    expect(listRes.status).toBe(200);
    const listBody = (await listRes.json()) as any;
    expect(listBody.success).toBe(true);
    expect(listBody.orgs.length).toBe(1);
    expect(listBody.orgs[0].slug).toBe('hono-org');
  });

  it('should support CRUD for topologies with tenant boundaries & share tokens', async () => {
    // 1. Setup User A
    const loginARes = await app.request('/auth/dev-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'user-a@hono.com', name: 'User A' }),
    });
    const { token: tokenA } = (await loginARes.json()) as any;

    // Create Org A
    const orgARes = await app.request('/orgs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ slug: 'org-a', name: 'Org A' }),
    });
    const { org: orgA } = (await orgARes.json()) as any;

    // 2. Setup User B (Org B)
    const loginBRes = await app.request('/auth/dev-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'user-b@hono.com', name: 'User B' }),
    });
    const { token: tokenB } = (await loginBRes.json()) as any;

    // Create Org B
    const orgBRes = await app.request('/orgs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenB}` },
      body: JSON.stringify({ slug: 'org-b', name: 'Org B' }),
    });
    // orgB is not read, but we execute the request to ensure org is created
    await orgBRes.json();

    // 3. User A creates PRIVATE topology in Org A
    const topoARes = await app.request('/topologies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({
        orgId: orgA.id,
        name: 'Private Cluster A',
        visibility: 'PRIVATE',
        definition: mockKafkaState,
      }),
    });

    expect(topoARes.status).toBe(201);
    const { topology: topoA } = (await topoARes.json()) as any;
    expect(topoA.name).toBe('Private Cluster A');

    // 4. User B attempts to read User A's PRIVATE topology -> Should fail with 404 (or 403)
    const readFailRes = await app.request(`/topologies/${topoA.id}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    expect(readFailRes.status).toBe(404);

    // 5. User B attempts to update User A's PRIVATE topology -> Should fail with 403
    const updateFailRes = await app.request(`/topologies/${topoA.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenB}` },
      body: JSON.stringify({ name: 'Hacked Topology' }),
    });
    expect(updateFailRes.status).toBe(403);

    // 6. User A updates topology to UNLISTED
    const makeUnlistedRes = await app.request(`/topologies/${topoA.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ visibility: 'UNLISTED' }),
    });
    expect(makeUnlistedRes.status).toBe(200);
    const { topology: unlistedTopo } = (await makeUnlistedRes.json()) as any;
    expect(unlistedTopo.shareToken).not.toBeNull();

    // 7. Fetch via share token (publicly accessible)
    const shareRes = await app.request(`/topologies/share/${unlistedTopo.shareToken}`);
    expect(shareRes.status).toBe(200);
    const shareBody = (await shareRes.json()) as any;
    expect(shareBody.success).toBe(true);
    expect(shareBody.topology.name).toBe('Private Cluster A');
  });

  it('should paginate topology listings with cursors and enforce membership', async () => {
    const loginRes = await app.request('/auth/dev-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'pager@hono.com', name: 'Pager' }),
    });
    const { token } = (await loginRes.json()) as any;
    const auth = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

    const orgRes = await app.request('/orgs', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ slug: 'page-org', name: 'Page Org' }),
    });
    const { org } = (await orgRes.json()) as any;

    for (let i = 1; i <= 3; i++) {
      const res = await app.request('/topologies', {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({
          orgId: org.id,
          name: `Paged Cluster ${i}`,
          visibility: 'PRIVATE',
          definition: mockKafkaState,
        }),
      });
      expect(res.status).toBe(201);
    }

    const page1Res = await app.request(`/topologies?orgId=${org.id}&limit=2`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(page1Res.status).toBe(200);
    const page1 = (await page1Res.json()) as any;
    expect(page1.success).toBe(true);
    expect(page1.topologies).toHaveLength(2);
    expect(page1.nextCursor).toBeTruthy();

    const page2Res = await app.request(
      `/topologies?orgId=${org.id}&limit=2&cursor=${encodeURIComponent(page1.nextCursor)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect(page2Res.status).toBe(200);
    const page2 = (await page2Res.json()) as any;
    expect(page2.topologies).toHaveLength(1);
    expect(page2.nextCursor).toBeNull();

    const names = [...page1.topologies, ...page2.topologies].map((t: any) => t.name).sort();
    expect(names).toEqual(['Paged Cluster 1', 'Paged Cluster 2', 'Paged Cluster 3']);

    const badCursorRes = await app.request(`/topologies?orgId=${org.id}&cursor=nope`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(badCursorRes.status).toBe(400);

    // Non-member cannot list
    const outsiderRes = await app.request('/auth/dev-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'outsider@hono.com', name: 'Outsider' }),
    });
    const { token: outsiderToken } = (await outsiderRes.json()) as any;
    const forbiddenRes = await app.request(`/topologies?orgId=${org.id}`, {
      headers: { Authorization: `Bearer ${outsiderToken}` },
    });
    expect(forbiddenRes.status).toBe(403);
  });

  it('should reject refresh token reuse after rotation', async () => {
    const regRes = await app.request('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'rotator@hono.com', name: 'Rotator', password: 's3cret-pass' }),
    });
    expect(regRes.status).toBe(201);
    const { refreshToken } = (await regRes.json()) as any;

    const first = await app.request('/auth/refresh', {
      method: 'POST',
      headers: { Authorization: `Bearer ${refreshToken}` },
    });
    expect(first.status).toBe(200);
    const { refreshToken: rotated } = (await first.json()) as any;
    expect(rotated).toBeTruthy();

    // Replaying the-rotated out token must fail
    const replay = await app.request('/auth/refresh', {
      method: 'POST',
      headers: { Authorization: `Bearer ${refreshToken}` },
    });
    expect(replay.status).toBe(401);

    // The rotated token still works
    const second = await app.request('/auth/refresh', {
      method: 'POST',
      headers: { Authorization: `Bearer ${rotated}` },
    });
    expect(second.status).toBe(200);
  });
});
