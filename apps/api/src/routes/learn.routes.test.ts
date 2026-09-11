import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import app from '../index.js';

describe('Learn routes (short links, progress sync, badges)', () => {
  let token = '';

  beforeAll(async () => {
    const email = `learner-${String(Date.now())}@example.com`;
    const reg = await app.request('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name: 'Learner', password: 's3cret-pass' }),
    });
    expect(reg.status).toBe(201);
    const body = (await reg.json()) as { token: string };
    token = body.token;
  });

  beforeEach(() => {
    expect(token).not.toBe('');
  });

  it('round-trips a short link', async () => {
    const payload = { v: 2, domainId: 'raft', seed: 7, events: [{ tick: 3, type: 'RAFT_PROPOSE', payload: {} }] };
    const created = await app.request('/learn/short-links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload }),
    });
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };
    expect(id).toMatch(/^[A-Za-z0-9_-]{10}$/);

    const fetched = await app.request(`/learn/short-links/${id}`);
    expect(fetched.status).toBe(200);
    const { payload: roundTripped } = (await fetched.json()) as { payload: typeof payload };
    expect(roundTripped).toEqual(payload);
  });

  it('rejects malformed short-link ids and payloads', async () => {
    const bad = await app.request('/learn/short-links/!!!');
    expect(bad.status).toBe(400);
    const missing = await app.request('/learn/short-links/AAAAAAAAAA');
    expect(missing.status).toBe(404);
    const invalid = await app.request('/learn/short-links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload: { v: 2, domainId: '', seed: -1, events: 'nope' } }),
    });
    expect(invalid.status).toBe(400);
  });

  it('syncs progress across devices (last-write-wins readback)', async () => {
    const progress = { version: 1, domains: {}, updatedAt: 1700000000000 };
    const put = await app.request('/learn/progress', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ progress }),
    });
    expect(put.status).toBe(200);
    const get = await app.request('/learn/progress', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(get.status).toBe(200);
    const { progress: stored } = (await get.json()) as { progress: typeof progress };
    expect(stored).toEqual(progress);
  });

  it('requires auth for progress sync', async () => {
    const res = await app.request('/learn/progress');
    expect(res.status).toBe(401);
  });

  it('issues and verifies a badge, and rejects forged signatures', async () => {
    const issue = await app.request('/learn/badges/issue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        trackId: 'distributed-systems-fundamentals',
        evidence: [{ kind: 'interview', refId: 'raft-leader-election', met: true }],
      }),
    });
    expect(issue.status).toBe(201);
    const { award, sig } = (await issue.json()) as { award: object; sig: string };
    expect(typeof sig).toBe('string');

    const verify = await app.request(
      `/learn/badges/verify?payload=${encodeURIComponent(JSON.stringify(award))}&sig=${sig}`,
    );
    expect(verify.status).toBe(200);
    const { valid } = (await verify.json()) as { valid: boolean };
    expect(valid).toBe(true);

    const forged = await app.request(
      `/learn/badges/verify?payload=${encodeURIComponent(JSON.stringify(award))}&sig=${'0'.repeat(64)}`,
    );
    expect(forged.status).toBe(400);
  });

  it('refuses badge issuance with unmet requirements', async () => {
    const issue = await app.request('/learn/badges/issue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        trackId: 'distributed-systems-fundamentals',
        evidence: [{ kind: 'interview', refId: 'raft-leader-election', met: false }],
      }),
    });
    expect(issue.status).toBe(400);
  });
});
