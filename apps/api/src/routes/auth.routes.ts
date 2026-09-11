import type { MiddlewareHandler } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { sign, verify } from 'hono/jwt';
import { nanoid } from 'nanoid';
import { z } from 'zod';

import { tokenRevocationStore, wsTicketStore } from '@the-visualizer/contracts';
import { logger } from '@the-visualizer/logging';

import { JWT_SECRET } from '../config.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { rateLimiter } from '../middleware/rate-limiter.js';
import { userRepository } from '../repositories/user.repository.js';
import { ConflictError, isPostgresConflict } from '../utils/errors.js';
import { hashPassword, verifyPassword } from '../utils/password.js';

const authRouter = new Hono();

// Stricter per-route bucket for credential endpoints (brute-force defense).
// Bypassed in tests so auth flows stay deterministic under the suite.
const authAttemptLimiter: MiddlewareHandler =
  process.env.NODE_ENV === 'test'
    ? async (_c, next) => {
        await next();
      }
    : rateLimiter({ limit: 10, refillRate: 0.5 });

// Constant salt and key format matching scrypt output to neutralize user enumeration timing attacks
const DUMMY_PASSWORD_HASH =
  'a1b2c3d4e5f60718293a4b5c6d7e8f90:00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';

const registerSchema = z.object({
  email: z.string().email().max(255),
  name: z.string().min(1).max(255),
  password: z.string().min(8, 'Password must be at least 8 characters').max(100),
});

const loginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(100),
});

const devLoginSchema = z.object({
  email: z.string().email().max(255),
  name: z.string().min(1).max(255),
});

/**
 * Helper to generate short-lived access token (15 mins) and refresh token (7 days).
 * Each token carries a unique `jti` so rapid rotation never mints a
 * byte-identical token (which would instantly match its own revocation entry).
 */
async function generateTokens(user: { id: string; email: string; name: string | null }) {
  const now = Math.floor(Date.now() / 1000);
  const accessTokenPayload = {
    id: user.id,
    email: user.email,
    name: user.name ?? '',
    type: 'access',
    jti: nanoid(21),
    exp: now + 15 * 60, // 15 minutes
  };

  const refreshTokenPayload = {
    id: user.id,
    email: user.email,
    name: user.name ?? '',
    type: 'refresh',
    jti: nanoid(21),
    exp: now + 7 * 24 * 60 * 60, // 7 days
  };

  const accessToken = await sign(accessTokenPayload, JWT_SECRET);
  const refreshToken = await sign(refreshTokenPayload, JWT_SECRET);

  return { accessToken, refreshToken };
}

// ─── 1. Register with Email + Password ────────────────────────────────────────
authRouter.post('/register', zValidator('json', registerSchema), async (c) => {
  const { email, name, password } = c.req.valid('json');

  const existing = await userRepository.getUserByEmail(email);
  if (existing) {
    // Execute dummy scrypt calculation to eliminate registration timing side-channel
    await hashPassword(password);
    logger.warn(
      { event: 'SECURITY_AUDIT', action: 'USER_REGISTRATION_COLLISION', email },
      'Registration attempt on existing email',
    );
    return c.json(
      {
        success: false,
        error: {
          code: 'USER_EXISTS',
          message:
            process.env.NODE_ENV === 'production'
              ? 'Unable to complete registration. Please check your credentials or log in.'
              : 'Email already registered',
        },
      },
      409,
    );
  }

  const passwordHash = await hashPassword(password);
  let user;
  try {
    user = await userRepository.createUser(email, name, passwordHash);
  } catch (err: unknown) {
    // Concurrent duplicate registration race: the pre-check above passed for
    // both requests, the unique constraint caught the loser.
    if (err instanceof ConflictError || isPostgresConflict(err)) {
      return c.json(
        {
          success: false,
          error: {
            code: 'USER_EXISTS',
            message:
              process.env.NODE_ENV === 'production'
                ? 'Unable to complete registration. Please check your credentials or log in.'
                : 'Email already registered',
          },
        },
        409,
      );
    }
    throw err;
  }

  const { accessToken, refreshToken } = await generateTokens(user);

  setCookie(c, 'session_token', accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    path: '/',
    maxAge: 15 * 60,
  });

  setCookie(c, 'refresh_token', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    path: '/auth/refresh',
    maxAge: 7 * 24 * 60 * 60,
  });

  logger.info(
    { event: 'SECURITY_AUDIT', action: 'USER_REGISTERED', userId: user.id, email: user.email },
    'New user registered',
  );

  return c.json(
    {
      success: true,
      user: { id: user.id, email: user.email, name: user.name },
      token: accessToken,
      refreshToken,
    },
    201,
  );
});

// ─── 2. Login with Email + Password ───────────────────────────────────────────
authRouter.post('/login', authAttemptLimiter, zValidator('json', loginSchema), async (c) => {
  const { email, password } = c.req.valid('json');

  const user = await userRepository.getUserByEmail(email);
  if (!user || !user.passwordHash) {
    // Execute dummy scrypt calculation to eliminate timing side-channel (CWE-208)
    await verifyPassword(password, DUMMY_PASSWORD_HASH);
    return c.json(
      {
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
      },
      401,
    );
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return c.json(
      {
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
      },
      401,
    );
  }


  const { accessToken, refreshToken } = await generateTokens(user);

  setCookie(c, 'session_token', accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    path: '/',
    maxAge: 15 * 60,
  });

  setCookie(c, 'refresh_token', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    path: '/auth/refresh',
    maxAge: 7 * 24 * 60 * 60,
  });

  logger.info(
    { event: 'SECURITY_AUDIT', action: 'USER_LOGGED_IN', userId: user.id, email: user.email },
    'User authentication successful',
  );

  return c.json({
    success: true,
    user: { id: user.id, email: user.email, name: user.name },
    token: accessToken,
    refreshToken,
  });
});

// ─── 3. Token Refresh with Rotation ──────────────────────────────────────────
authRouter.post('/refresh', async (c) => {
  let refreshToken = getCookie(c, 'refresh_token');
  if (!refreshToken) {
    const authHeader = c.req.header('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      refreshToken = authHeader.substring(7);
    }
  }

  if (!refreshToken) {
    return c.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Missing refresh token' } },
      401,
    );
  }

  try {
    const payload = (await verify(refreshToken, JWT_SECRET, 'HS256')) as Record<string, unknown>;
    if (payload.type !== 'refresh' || typeof payload.id !== 'string') {
      return c.json(
        { success: false, error: { code: 'INVALID_TOKEN', message: 'Invalid refresh token' } },
        401,
      );
    }

    // Rotation-reuse detection: a presented refresh token that is already
    // revoked was either rotated (normal client bug) or stolen and replayed
    // (attack) — either way it must not mint new tokens.
    if (await tokenRevocationStore.isRevoked(refreshToken)) {
      return c.json(
        {
          success: false,
          error: { code: 'INVALID_TOKEN', message: 'Refresh token already used or revoked' },
        },
        401,
      );
    }

    const user = await userRepository.getUserById(payload.id);
    if (!user) {
      return c.json(
        { success: false, error: { code: 'USER_NOT_FOUND', message: 'User not found' } },
        401,
      );
    }

    const tokens = await generateTokens(user);

    // Rotate: revoke the presented refresh token for its remaining lifetime so
    // it can never be replayed.
    const nowSec = Math.floor(Date.now() / 1000);
    const remainingTtl =
      typeof payload.exp === 'number' ? Math.max(1, payload.exp - nowSec) : 7 * 24 * 3600;
    await tokenRevocationStore.revoke(refreshToken, remainingTtl);

    setCookie(c, 'session_token', tokens.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Lax',
      path: '/',
      maxAge: 15 * 60,
    });

    setCookie(c, 'refresh_token', tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Lax',
      path: '/auth/refresh',
      maxAge: 7 * 24 * 60 * 60,
    });

    return c.json({
      success: true,
      token: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
  } catch {
    return c.json(
      {
        success: false,
        error: { code: 'INVALID_TOKEN', message: 'Expired or invalid refresh token' },
      },
      401,
    );
  }
});

// ─── 3b. WebSocket Single-Use Ticket Exchange ────────────────────────────────
authRouter.post('/ws-ticket', async (c) => {
  let token = getCookie(c, 'session_token');
  if (!token) {
    const authHeader = c.req.header('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
  }

  if (!token) {
    return c.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
      401,
    );
  }

  if (await tokenRevocationStore.isRevoked(token)) {
    return c.json(
      { success: false, error: { code: 'TOKEN_REVOKED', message: 'Session has been revoked' } },
      401,
    );
  }

  try {
    const payload = (await verify(token, JWT_SECRET, 'HS256')) as Record<string, unknown>;
    const ticket = await wsTicketStore.createTicket(
      {
        userId: payload.id as string,
        email: payload.email as string,
        name: (payload.name as string) ?? '',
        createdAt: Date.now(),
      },
      30, // 30 seconds expiry
    );

    return c.json({ success: true, ticket, expiresInSeconds: 30 });
  } catch {
    return c.json(
      { success: false, error: { code: 'INVALID_TOKEN', message: 'Invalid access token' } },
      401,
    );
  }
});

// ─── 4. Logout & Revocation ──────────────────────────────────────────────────
authRouter.post('/logout', async (c) => {

  const sessionToken = getCookie(c, 'session_token');
  const refreshToken = getCookie(c, 'refresh_token');
  const authHeader = c.req.header('Authorization');
  let bearerToken: string | undefined;
  if (authHeader?.startsWith('Bearer ')) {
    bearerToken = authHeader.substring(7);
  }

  if (sessionToken) await tokenRevocationStore.revoke(sessionToken);
  if (refreshToken) await tokenRevocationStore.revoke(refreshToken);
  if (bearerToken) await tokenRevocationStore.revoke(bearerToken);

  deleteCookie(c, 'session_token', { path: '/' });
  logger.info(
    { event: 'SECURITY_AUDIT', action: 'USER_LOGGED_OUT' },
    'User session logged out and tokens revoked',
  );
  return c.json({ success: true, message: 'Successfully logged out and session revoked' });
});

const revokeSchema = z.object({
  token: z.string().min(1),
});

authRouter.post('/revoke', requireAuth, zValidator('json', revokeSchema), async (c) => {
  const { token } = c.req.valid('json');
  const user = c.get('user');
  await tokenRevocationStore.revoke(token);
  logger.info(
    { event: 'SECURITY_AUDIT', action: 'TOKEN_REVOKED', actorId: user?.id },
    'Token successfully revoked',
  );
  return c.json({ success: true, message: 'Token successfully revoked' });
});

// ─── 5. Dev Login (Strictly Gated from Production) ────────────────────────────
authRouter.post('/dev-login', zValidator('json', devLoginSchema), async (c) => {
  if (process.env.NODE_ENV === 'production') {
    return c.json(
      {
        success: false,
        error: { code: 'FORBIDDEN', message: 'Dev login is disabled in production' },
      },
      403,
    );
  }

  const { email, name } = c.req.valid('json');
  let user = await userRepository.getUserByEmail(email);
  if (!user) {
    user = await userRepository.createUser(email, name);
  }

  const { accessToken, refreshToken } = await generateTokens(user);

  setCookie(c, 'session_token', accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    path: '/',
    maxAge: 86400,
  });

  return c.json({
    success: true,
    user: { id: user.id, email: user.email, name: user.name },
    token: accessToken,
    refreshToken,
  });
});

export { authRouter };
