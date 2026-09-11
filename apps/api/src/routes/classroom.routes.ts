import { createHash, randomBytes } from 'node:crypto';

import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { z } from 'zod';

import {
  ClassroomAssessmentSchema,
  makeInviteCode,
} from '@the-visualizer/contracts';

import { redis } from '../db/redis.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { toErrorResponse } from '../utils/errors.js';

const classroomRouter = new Hono();

const SESSION_TTL_SECONDS = 7 * 24 * 3600;
const SESSION_PREFIX = 'classroom:session:';
const CODE_PREFIX = 'classroom:code:';
const ROSTER_PREFIX = 'classroom:roster:';
const ASSESS_PREFIX = 'classroom:assess:';

function sessionKey(id: string): string {
  return `${SESSION_PREFIX}${id}`;
}
function codeKey(code: string): string {
  return `${CODE_PREFIX}${code}`;
}
function rosterKey(id: string): string {
  return `${ROSTER_PREFIX}${id}`;
}
function assessKey(sessionId: string, userId: string): string {
  const digest = createHash('sha256').update(`${sessionId}:${userId}`).digest('hex').slice(0, 32);
  return `${ASSESS_PREFIX}${digest}`;
}

const createSessionBody = z.object({
  title: z.string().min(1).max(200),
  domainId: z.string().min(1).max(64),
  scenarioId: z.string().min(1).max(128).optional(),
  endsAt: z.number().int().positive().max(4102444800000).optional(),
});

// Create a classroom session (caller becomes PRESENTER).
classroomRouter.post('/sessions', requireAuth, zValidator('json', createSessionBody), async (c) => {
  try {
    const user = c.get('user')!;
    const body = c.req.valid('json');
    const id = nanoid(12);
    const inviteCode = makeInviteCode(randomBytes(6));
    const now = Date.now();
    const session = {
      id,
      title: body.title,
      domainId: body.domainId,
      scenarioId: body.scenarioId,
      presenterUserId: user.id,
      inviteCode,
      createdAt: now,
      endsAt: body.endsAt,
    };
    await redis
      .pipeline()
      .setex(sessionKey(id), SESSION_TTL_SECONDS, JSON.stringify(session))
      .setex(codeKey(inviteCode), SESSION_TTL_SECONDS, id)
      .hset(rosterKey(id), user.id, JSON.stringify({ userId: user.id, name: user.email, role: 'PRESENTER', joinedAt: now }))
      .expire(rosterKey(id), SESSION_TTL_SECONDS)
      .exec();
    return c.json({ success: true, session }, 201);
  } catch (err: unknown) {
    const { status, body } = toErrorResponse(err, 'Failed to create classroom session');
    return c.json(body, status as 400 | 500);
  }
});

// Join by invite code (STUDENT unless the presenter re-joins).
classroomRouter.post(
  '/sessions/join',
  requireAuth,
  zValidator('json', z.object({ inviteCode: z.string().min(6).max(16), name: z.string().min(1).max(255).optional() })),
  async (c) => {
    try {
      const user = c.get('user')!;
      const { inviteCode, name } = c.req.valid('json');
      const id = await redis.get(codeKey(inviteCode.toUpperCase()));
      if (!id) {
        return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Invite code invalid or expired' } }, 404);
      }
      const raw = await redis.get(sessionKey(id));
      if (!raw) {
        return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Session expired' } }, 404);
      }
      const session = JSON.parse(raw) as { presenterUserId: string };
      const role = session.presenterUserId === user.id ? 'PRESENTER' : 'STUDENT';
      const entry = { userId: user.id, name: name ?? user.email, role, joinedAt: Date.now() };
      await redis.pipeline().hset(rosterKey(id), user.id, JSON.stringify(entry)).expire(rosterKey(id), SESSION_TTL_SECONDS).exec();
      return c.json({ success: true, sessionId: id, role });
    } catch (err: unknown) {
      const { status, body } = toErrorResponse(err, 'Failed to join classroom session');
      return c.json(body, status as 400 | 404 | 500);
    }
  },
);

// Roster + session detail (members only).
classroomRouter.get('/sessions/:id', requireAuth, zValidator('param', z.object({ id: z.string().min(1).max(64) })), async (c) => {
  try {
    const user = c.get('user')!;
    const { id } = c.req.valid('param');
    const raw = await redis.get(sessionKey(id));
    if (!raw) {
      return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Session not found or expired' } }, 404);
    }
    const roster = await redis.hgetall(rosterKey(id));
    if (!roster[user.id]) {
      return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Not a member of this session' } }, 403);
    }
    const entries = Object.values(roster).map((v) => JSON.parse(v));
    return c.json({ success: true, session: JSON.parse(raw), roster: entries });
  } catch (err: unknown) {
    const { status, body } = toErrorResponse(err, 'Failed to load classroom session');
    return c.json(body, status as 403 | 404 | 500);
  }
});

// Submit a self-assessment (students; presenters see all submissions).
classroomRouter.post(
  '/sessions/:id/assessments',
  requireAuth,
  zValidator('param', z.object({ id: z.string().min(1).max(64) })),
  zValidator(
    'json',
    z.object({
      quizScore: z.number().min(0).max(1).optional(),
      challengesSolved: z.number().int().nonnegative().max(1000).optional(),
      rubric: z.array(z.object({ item: z.string().min(1).max(500), met: z.boolean() })).min(1).max(40),
    }),
  ),
  async (c) => {
    try {
      const user = c.get('user')!;
      const { id } = c.req.valid('param');
      const body = c.req.valid('json');
      const raw = await redis.get(sessionKey(id));
      if (!raw) {
        return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Session not found or expired' } }, 404);
      }
      const member = await redis.hget(rosterKey(id), user.id);
      if (!member) {
        return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Not a member of this session' } }, 403);
      }
      const assessment = ClassroomAssessmentSchema.parse({
        sessionId: id,
        userId: user.id,
        quizScore: body.quizScore,
        challengesSolved: body.challengesSolved,
        rubric: body.rubric,
        submittedAt: Date.now(),
      });
      await redis.setex(assessKey(id, user.id), SESSION_TTL_SECONDS, JSON.stringify(assessment));
      return c.json({ success: true }, 201);
    } catch (err: unknown) {
      const { status, body } = toErrorResponse(err, 'Failed to submit assessment');
      return c.json(body, status as 400 | 403 | 404 | 500);
    }
  },
);

// Presenter view of all submissions.
classroomRouter.get(
  '/sessions/:id/assessments',
  requireAuth,
  zValidator('param', z.object({ id: z.string().min(1).max(64) })),
  async (c) => {
    try {
      const user = c.get('user')!;
      const { id } = c.req.valid('param');
      const raw = await redis.get(sessionKey(id));
      if (!raw) {
        return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Session not found or expired' } }, 404);
      }
      const session = JSON.parse(raw) as { presenterUserId: string };
      if (session.presenterUserId !== user.id) {
        return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Presenter only' } }, 403);
      }
      const roster = await redis.hgetall(rosterKey(id));
      const assessments = [];
      for (const memberId of Object.keys(roster)) {
        const stored = await redis.get(assessKey(id, memberId));
        if (stored) assessments.push(JSON.parse(stored));
      }
      return c.json({ success: true, assessments });
    } catch (err: unknown) {
      const { status, body } = toErrorResponse(err, 'Failed to load assessments');
      return c.json(body, status as 403 | 404 | 500);
    }
  },
);

export { classroomRouter };
