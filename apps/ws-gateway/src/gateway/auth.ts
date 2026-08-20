import { verify } from 'hono/jwt';

import { JWT_SECRET } from '../config.js';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
}

/**
 * Verifies JWT token from connection URL parameters or Cookie headers.
 */
export async function authenticateConnection(
  urlStr: string,
  cookieHeader?: string,
): Promise<AuthenticatedUser | null> {
  try {
    let token: string | undefined;

    // 1. Try URL Query parameters (e.g. ws://localhost:3001?token=<JWT>)
    const parsedUrl = new URL(urlStr, 'http://localhost');
    const queryToken = parsedUrl.searchParams.get('token');
    if (queryToken) {
      token = queryToken;
    }

    // 2. Try Cookie Header
    if (!token && cookieHeader) {
      const match = /session_token=([^;]+)/.exec(cookieHeader);
      const matchedToken = match?.[1];
      if (matchedToken) {
        token = matchedToken;
      }
    }

    if (!token) return null;

    // Verify JWT payload
    const payload = (await verify(token, JWT_SECRET, 'HS256')) as Record<string, unknown>;
    if (typeof payload.id === 'string' && typeof payload.email === 'string') {
      return {
        id: payload.id,
        email: payload.email,
        name: typeof payload.name === 'string' ? payload.name : '',
      };
    }
  } catch {
    // JWT verification failed
  }

  return null;
}
