import { beforeAll, describe, expect, it } from 'vitest';

import app from '../index.js';

const SCRIPT = {
  version: 1 as const,
  id: 'rl-replay-1',
  title: 'Boundary burst replay',
  domainId: 'rate-limiter',
  seed: 12345,
  description: 'Two quotas across a window boundary.',
  steps: ['burst', 'burst again'],
  events: [
    { tick: 9, type: 'RATE_LIMITER_BURST', payload: { clientId: 'c1', count: 10 } },
    { tick: 11, type: 'RATE_LIMITER_BURST', payload: { clientId: 'c1', count: 10 } },
  ],
  tags: ['rate-limiting'],
};

describe('Replay persistence API', () => {
  let token = '';
  let topologyId = '';

  beforeAll(async () => {
    const email = `replay-${String(Date.now())}@example.com`;
    const reg = await app.request('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name: 'Replayer', password: 's3cret-pass' }),
    });
    token = ((await reg.json()) as { token: string }).token;

    const auth = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
    const orgRes = await app.request('/orgs', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ slug: `replay-org-${String(Date.now())}`, name: 'Replay Org' }),
    });
    const org = ((await orgRes.json()) as { org: { id: string } }).org;

    const topoRes = await app.request('/topologies', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({
        orgId: org.id,
        name: 'Replay Topology',
        visibility: 'PRIVATE',
        definition: { brokers: 3 },
      }),
    });
    topologyId = ((await topoRes.json()) as { topology: { id: string } }).topology.id;
  });

  it('persists a replay, de-duplicates by content hash, and reads it back', async () => {
    const auth = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

    const first = await app.request('/replays', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ topologyId, script: SCRIPT }),
    });
    expect(first.status).toBe(201);
    const saved = (await first.json()) as { replay: { id: string; contentHash: string; totalEvents: number } };
    expect(saved.replay.contentHash).toBeTruthy();
    expect(saved.replay.totalEvents).toBe(2);

    // Re-saving the identical script is idempotent (same row id).
    const second = await app.request('/replays', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ topologyId, script: SCRIPT }),
    });
    expect(second.status).toBe(201);
    const again = (await second.json()) as { replay: { id: string } };
    expect(again.replay.id).toBe(saved.replay.id);

    // Different script -> different content hash and row.
    const changed = { ...SCRIPT, id: 'rl-replay-2', seed: 999 };
    const third = await app.request('/replays', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ topologyId, script: changed }),
    });
    expect(third.status).toBe(201);
    const changedSaved = (await third.json()) as { replay: { id: string; contentHash: string } };
    expect(changedSaved.replay.id).not.toBe(saved.replay.id);
    expect(changedSaved.replay.contentHash).not.toBe(saved.replay.contentHash);

    // Read back the artifact and confirm the script survives intact.
    const get = await app.request(`/replays/${saved.replay.id}`, { headers: { Authorization: `Bearer ${token}` } });
    expect(get.status).toBe(200);
    const body = (await get.json()) as { script: typeof SCRIPT };
    expect(body.script.seed).toBe(SCRIPT.seed);
    expect(body.script.events).toEqual(SCRIPT.events);

    // Listing returns both replays for the topology.
    const list = await app.request(`/replays?topologyId=${topologyId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(list.status).toBe(200);
    const listed = (await list.json()) as { replays: unknown[] };
    expect(listed.replays.length).toBeGreaterThanOrEqual(2);
  });

  it('rejects unauthenticated, malformed, and non-member requests', async () => {
    const unauth = await app.request('/replays', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topologyId, script: SCRIPT }),
    });
    expect(unauth.status).toBe(401);

    const malformed = await app.request('/replays', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ topologyId, script: { ...SCRIPT, events: 'nope' } }),
    });
    expect(malformed.status).toBe(400);

    // A second user who is not a member of the topology's org cannot read it.
    const otherEmail = `outsider-${String(Date.now())}@example.com`;
    const otherReg = await app.request('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: otherEmail, name: 'Outsider', password: 's3cret-pass' }),
    });
    const otherToken = ((await otherReg.json()) as { token: string }).token;
    const list = await app.request(`/replays?topologyId=${topologyId}`, {
      headers: { Authorization: `Bearer ${otherToken}` },
    });
    expect(list.status).toBe(403);
  });
});
