import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { sign, verify } from 'hono/jwt';
import { z } from 'zod';

import { tokenRevocationStore } from '@the-visualizer/contracts';
import { JWT_SECRET } from '../config.js';
import { userRepository } from '../repositories/user.repository.js';
import { hashPassword, verifyPassword } from '../utils/password.js';

const authRouter = new Hono();

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
 */
async function generateTokens(user: { id: string; email: string; name: string | null }) {
  const now = Math.floor(Date.now() / 1000);
  const accessTokenPayload = {
    id: user.id,
    email: user.email,
    name: user.name ?? '',
    type: 'access',
    exp: now + 15 * 60, // 15 minutes
  };

  const refreshTokenPayload = {
    id: user.id,
    email: user.email,
    name: user.name ?? '',
    type: 'refresh',
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
    return c.json({ success: false, error: { code: 'USER_EXISTS', message: 'Email already registered' } }, 409);
  }

  const passwordHash = await hashPassword(password);
  const user = await userRepository.createUser(email, name, passwordHash);

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

  return c.json({
    success: true,
    user: { id: user.id, email: user.email, name: user.name },
    token: accessToken,
    refreshToken,
  }, 201);
});

// ─── 2. Login with Email + Password ───────────────────────────────────────────
authRouter.post('/login', zValidator('json', loginSchema), async (c) => {
  const { email, password } = c.req.valid('json');

  const user = await userRepository.getUserByEmail(email);
  if (!user || !user.passwordHash) {
    return c.json({ success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } }, 401);
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return c.json({ success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } }, 401);
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
    return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Missing refresh token' } }, 401);
  }

  try {
    const payload = (await verify(refreshToken, JWT_SECRET, 'HS256')) as Record<string, unknown>;
    if (payload.type !== 'refresh' || typeof payload.id !== 'string') {
      return c.json({ success: false, error: { code: 'INVALID_TOKEN', message: 'Invalid refresh token' } }, 401);
    }

    const user = await userRepository.getUserById(payload.id);
    if (!user) {
      return c.json({ success: false, error: { code: 'USER_NOT_FOUND', message: 'User not found' } }, 401);
    }

    const tokens = await generateTokens(user);

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
    return c.json({ success: false, error: { code: 'INVALID_TOKEN', message: 'Expired or invalid refresh token' } }, 401);
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
  deleteCookie(c, 'refresh_token', { path: '/auth/refresh' });
  return c.json({ success: true, message: 'Successfully logged out and session revoked' });
});

const revokeSchema = z.object({
  token: z.string().min(1),
});

authRouter.post('/revoke', zValidator('json', revokeSchema), async (c) => {
  const { token } = c.req.valid('json');
  await tokenRevocationStore.revoke(token);
  return c.json({ success: true, message: 'Token successfully revoked' });
});

// ─── 5. Dev Login (Strictly Gated from Production) ────────────────────────────
authRouter.post('/dev-login', zValidator('json', devLoginSchema), async (c) => {
  if (process.env.NODE_ENV === 'production' && process.env.ENABLE_DEV_LOGIN !== 'true') {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Dev login is disabled in production' } }, 403);
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
