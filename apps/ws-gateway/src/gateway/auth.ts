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
      const match = cookieHeader.match(/session_token=([^;]+)/);
      if (match && match[1]) {
        token = match[1];
      }
    }

    if (!token) return null;

    // Verify JWT payload
    const payload = await verify(token, JWT_SECRET, 'HS256');
    if (payload && typeof payload['id'] === 'string' && typeof payload['email'] === 'string') {
      return {
        id: payload['id'],
        email: payload['email'],
        name: String(payload['name'] || ''),
      };
    }
  } catch (err) {
    // JWT verification failed
  }

  return null;
}
