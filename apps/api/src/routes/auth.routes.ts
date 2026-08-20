import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { deleteCookie, setCookie } from 'hono/cookie';
import { sign } from 'hono/jwt';
import { z } from 'zod';

import { JWT_SECRET } from '../config.js';
import { userRepository } from '../repositories/user.repository.js';

const authRouter = new Hono();

const devLoginSchema = z.object({
  email: z.string().email().max(255),
  name: z.string().min(1).max(255),
});

authRouter.post('/dev-login', zValidator('json', devLoginSchema), async (c) => {
  const { email, name } = c.req.valid('json');

  // Find or create user
  let user = await userRepository.getUserByEmail(email);
  if (!user) {
    user = await userRepository.createUser(email, name);
  }

  // Sign JWT session token
  // Expire in 24 hours
  const payload = {
    id: user.id,
    email: user.email,
    name: user.name,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
  };

  const token = await sign(payload, JWT_SECRET);

  // Set Secure HttpOnly cookie
  setCookie(c, 'session_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    path: '/',
    maxAge: 86400, // 24 hours in seconds
  });

  return c.json({
    success: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
    },
    token,
  });
});

authRouter.post('/logout', (c) => {
  deleteCookie(c, 'session_token', {
    path: '/',
  });
  return c.json({
    success: true,
    message: 'Successfully logged out',
  });
});

export { authRouter };
