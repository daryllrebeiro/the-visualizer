import { beforeAll, describe, expect, it } from 'vitest';

import app from '../index.js';

describe('Classroom sessions API', () => {
  let presenterToken = '';
  let studentToken = '';
  let presenterEmail = '';

  beforeAll(async () => {
    const stamp = String(Date.now());
    presenterEmail = `teacher-${stamp}@example.com`;
    const reg = await app.request('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: presenterEmail, name: 'Teacher', password: 's3cret-pass' }),
    });
    presenterToken = ((await reg.json()) as { token: string }).token;

    const other = await app.request('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `student-${stamp}@example.com`, name: 'Student', password: 's3cret-pass' }),
    });
    studentToken = ((await other.json()) as { token: string }).token;
  });

  it('creates a session, joins via invite code, and gates by membership', async () => {
    const create = await app.request('/classroom/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${presenterToken}` },
      body: JSON.stringify({ title: 'Raft lab', domainId: 'raft', scenarioId: 'raft-election-race' }),
    });
    expect(create.status).toBe(201);
    const { session } = (await create.json()) as {
      session: { id: string; inviteCode: string; presenterUserId: string };
    };
    expect(session.inviteCode).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);

    // Bad invite code is rejected.
    const badJoin = await app.request('/classroom/sessions/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${studentToken}` },
      body: JSON.stringify({ inviteCode: 'XXXXXX' }),
    });
    expect(badJoin.status).toBe(404);

    // Student joins as STUDENT.
    const join = await app.request('/classroom/sessions/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${studentToken}` },
      body: JSON.stringify({ inviteCode: session.inviteCode }),
    });
    expect(join.status).toBe(200);
    const joined = (await join.json()) as { role: string; sessionId: string };
    expect(joined.role).toBe('STUDENT');
    expect(joined.sessionId).toBe(session.id);

    // Roster shows presenter + student; students see submissions endpoint gated.
    const detail = await app.request(`/classroom/sessions/${session.id}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    expect(detail.status).toBe(200);
    const roster = ((await detail.json()) as { roster: unknown[] }).roster;
    expect(roster.length).toBe(2);

    const studentSeesAll = await app.request(`/classroom/sessions/${session.id}/assessments`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    expect(studentSeesAll.status).toBe(403);
  });

  it('accepts student self-assessments and exposes them to the presenter', async () => {
    const create = await app.request('/classroom/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${presenterToken}` },
      body: JSON.stringify({ title: 'RL lab', domainId: 'rate-limiter' }),
    });
    const { session } = (await create.json()) as { session: { id: string; inviteCode: string } };

    await app.request('/classroom/sessions/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${studentToken}` },
      body: JSON.stringify({ inviteCode: session.inviteCode }),
    });

    const submit = await app.request(`/classroom/sessions/${session.id}/assessments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${studentToken}` },
      body: JSON.stringify({
        quizScore: 0.85,
        challengesSolved: 2,
        rubric: [
          { item: 'Named a concrete algorithm', met: true },
          { item: 'Explained the boundary burst', met: false },
        ],
      }),
    });
    expect(submit.status).toBe(201);

    const view = await app.request(`/classroom/sessions/${session.id}/assessments`, {
      headers: { Authorization: `Bearer ${presenterToken}` },
    });
    expect(view.status).toBe(200);
    const { assessments } = (await view.json()) as { assessments: Array<{ quizScore: number; rubric: unknown[] }> };
    expect(assessments).toHaveLength(1);
    expect(assessments[0]?.quizScore).toBe(0.85);
    expect(assessments[0]?.rubric).toHaveLength(2);

    // Empty rubric is rejected by validation.
    const empty = await app.request(`/classroom/sessions/${session.id}/assessments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${studentToken}` },
      body: JSON.stringify({ rubric: [] }),
    });
    expect(empty.status).toBe(400);
  });

  it('rejects unauthenticated classroom access', async () => {
    const res = await app.request('/classroom/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'X', domainId: 'raft' }),
    });
    expect(res.status).toBe(401);
  });
});
