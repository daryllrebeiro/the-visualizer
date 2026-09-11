import { createHmac, timingSafeEqual } from 'node:crypto';

import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { z } from 'zod';

import { BadgeAwardSchema, PermalinkPayloadV2Schema, UserProgressSchema } from '@the-visualizer/contracts';

import { JWT_SECRET } from '../config.js';
import { redis } from '../db/redis.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { toErrorResponse } from '../utils/errors.js';

const learnRouter = new Hono();

const SIGNING_SECRET = process.env['BADGE_SIGNING_SECRET'] || JWT_SECRET;
const SHORT_LINK_TTL_SECONDS = 30 * 24 * 3600;
const PROGRESS_TTL_SECONDS = 365 * 24 * 3600;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      out[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

function signAward(canonicalJson: string): string {
  return createHmac('sha256', SIGNING_SECRET).update(canonicalJson, 'utf8').digest('hex');
}

// ─── Short links for large permalinks (feature 4) ────────────────────────────

learnRouter.post('/short-links', zValidator('json', z.object({ payload: PermalinkPayloadV2Schema })), async (c) => {
  try {
    const { payload } = c.req.valid('json');
    const id = nanoid(10);
    await redis.setex(`learn:shortlink:${id}`, SHORT_LINK_TTL_SECONDS, JSON.stringify(payload));
    return c.json({ success: true, id }, 201);
  } catch (err: unknown) {
    const { status, body } = toErrorResponse(err, 'Failed to create short link');
    return c.json(body, status as 400 | 500);
  }
});

learnRouter.get('/short-links/:id', async (c) => {
  const id = c.req.param('id');
  if (!/^[A-Za-z0-9_-]{10}$/.test(id)) {
    return c.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Invalid short link id' } }, 400);
  }
  const raw = await redis.get(`learn:shortlink:${id}`);
  if (!raw) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Short link not found or expired' } }, 404);
  }
  const parsed = PermalinkPayloadV2Schema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Short link payload invalid' } }, 404);
  }
  return c.json({ success: true, payload: parsed.data });
});

// ─── Cross-device progress sync (feature 1) ──────────────────────────────────

learnRouter.get('/progress', requireAuth, async (c) => {
  const user = c.get('user')!;
  const raw = await redis.get(`learn:progress:${user.id}`);
  if (!raw) return c.json({ success: true, progress: null });
  const parsed = UserProgressSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) return c.json({ success: true, progress: null });
  return c.json({ success: true, progress: parsed.data });
});

learnRouter.put('/progress', requireAuth, zValidator('json', z.object({ progress: UserProgressSchema })), async (c) => {
  try {
    const user = c.get('user')!;
    const { progress } = c.req.valid('json');
    await redis.setex(`learn:progress:${user.id}`, PROGRESS_TTL_SECONDS, JSON.stringify(progress));
    return c.json({ success: true });
  } catch (err: unknown) {
    const { status, body } = toErrorResponse(err, 'Failed to save progress');
    return c.json(body, status as 400 | 500);
  }
});

// ─── Badge issuance + public verification (feature 7) ────────────────────────
// Trust model (documented): badges attest completion as recorded by the
// learner's own client (self-asserted learning badges, not proctored exams).
// The HMAC proves the award was minted by this platform, not that a human
// invigilated it.

const evidenceSchema = z.object({
  trackId: z.string().min(1).max(128),
  evidence: z
    .array(
      z.object({
        kind: z.enum(['scenario', 'quiz-threshold', 'interview']),
        refId: z.string().min(1).max(128),
        met: z.boolean(),
      }),
    )
    .min(1)
    .max(40),
});

learnRouter.post('/badges/issue', requireAuth, zValidator('json', evidenceSchema), async (c) => {
  try {
    const user = c.get('user')!;
    const { trackId, evidence } = c.req.valid('json');
    if (evidence.some((e) => !e.met)) {
      return c.json(
        { success: false, error: { code: 'REQUIREMENTS_UNMET', message: 'Not all track requirements are met' } },
        400,
      );
    }
    const award = BadgeAwardSchema.parse({ trackId, userId: user.id, earnedAt: Date.now() });
    const canonical = JSON.stringify(canonicalize(award));
    const sig = signAward(canonical);
    return c.json({ success: true, award, sig }, 201);
  } catch (err: unknown) {
    const { status, body } = toErrorResponse(err, 'Failed to issue badge');
    return c.json(body, status as 400 | 500);
  }
});

learnRouter.get('/badges/verify', zValidator('query', z.object({ payload: z.string().min(1).max(2000), sig: z.string().min(1).max(256) })), async (c) => {
  const { payload, sig } = c.req.valid('query');
  let award: unknown;
  try {
    award = JSON.parse(payload);
  } catch {
    return c.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Malformed payload' } }, 400);
  }
  const parsed = BadgeAwardSchema.safeParse(award);
  if (!parsed.success) {
    return c.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Malformed award' } }, 400);
  }
  const canonical = JSON.stringify(canonicalize(parsed.data));
  const expected = signAward(canonical);
  const a = Buffer.from(sig, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return c.json({ success: false, error: { code: 'INVALID_SIGNATURE', message: 'Badge signature invalid' } }, 400);
  }
  return c.json({ success: true, valid: true, award: parsed.data });
});

export { learnRouter };
