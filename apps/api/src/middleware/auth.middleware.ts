import type { MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import { verify } from 'hono/jwt';

import { JWT_SECRET } from '../config.js';
import { userRepository } from '../repositories/user.repository.js';

export interface UserContextPayload {
  id: string;
  email: string;
  name: string;
}

declare module 'hono' {
  interface ContextVariableMap {
    user?: UserContextPayload;
  }
}

/**
 * Extracts and verifies authentication tokens from cookies or Authorization header.
 * Populates context variable `user` if successful, otherwise leaves it undefined.
 */
export const authenticate: MiddlewareHandler = async (c, next) => {
  let token: string | undefined;

  // 1. Try Authorization header
  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  }

  // 2. Try Cookie
  if (!token) {
    token = getCookie(c, 'session_token');
  }

  if (token) {
    try {
      const payload = await verify(token, JWT_SECRET, 'HS256');
      if (payload && typeof payload['id'] === 'string') {
        // Fetch or verify user exists in DB
        const user = await userRepository.getUserById(payload['id']);
        if (user) {
          c.set('user', {
            id: user.id,
            email: user.email,
            name: user.name || '',
          });
        }
      }
    } catch (err) {
      // Invalid/Expired token - intentionally ignore so that requireAuth can handle rejection
    }
  }

  return await next();
};

/**
 * Enforces that a valid user session exists.
 * Throws 401 if context user is missing.
 */
export const requireAuth: MiddlewareHandler = async (c, next) => {
  const user = c.get('user');
  if (!user) {
    return c.json(
      {
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication credentials are required',
        },
      },
      401,
    );
  }
  return await next();
};
