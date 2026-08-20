import { sql } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { KafkaClusterState } from '@the-visualizer/contracts';

import { db } from '../db/index.js';
import app from '../index.js';

describe('Hono REST API Routing & Auth Integration Tests', () => {
  let mockKafkaState: KafkaClusterState;

  beforeAll(async () => {
    mockKafkaState = {
      clusterId: 'kafka-cluster-id' as never,
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

  it('should support dev-login and set session cookie', async () => {
    const res = await app.request('/auth/dev-login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'test@hono.com',
        name: 'Hono User',
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.user.email).toBe('test@hono.com');
    expect(body.token).toBeDefined();

    // Verify Set-Cookie header contains session_token
    const setCookie = res.headers.get('Set-Cookie');
    expect(setCookie).toContain('session_token=');
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

    expect(createRes.status).toBe(200);
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

    expect(topoARes.status).toBe(200);
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
});
