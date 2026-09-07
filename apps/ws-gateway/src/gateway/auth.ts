import { verify } from 'hono/jwt';

import { tokenRevocationStore, wsTicketStore } from '@the-visualizer/contracts';
import { logger } from '@the-visualizer/logging';

import { JWT_SECRET } from '../config.js';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
}

/**
 * Verifies WebSocket connection authentication via:
 * 1. Single-use short-lived Ticket parameter (?ticket=wst_...)
 * 2. HttpOnly Cookie header (Cookie: session_token=<JWT>)
 * 3. Fallback JWT query parameter (?token=<JWT>) - strictly blocked in production to prevent access-log credential leaks.
 */
export async function authenticateConnection(
  urlStr: string,
  cookieHeader?: string,
): Promise<AuthenticatedUser | null> {
  try {
    const parsedUrl = new URL(urlStr, 'http://localhost');

    // 1. Preferred: Single-use short-lived ticket (?ticket=wst_...)
    const ticket = parsedUrl.searchParams.get('ticket');
    if (ticket) {
      const ticketUser = await wsTicketStore.consumeTicket(ticket);
      if (ticketUser) {
        return {
          id: ticketUser.userId,
          email: ticketUser.email,
          name: ticketUser.name,
        };
      }
      return null;
    }

    let token: string | undefined;

    // 2. Cookie Header (Cookie: session_token=<JWT>)
    if (cookieHeader) {
      const match = /session_token=([^;]+)/.exec(cookieHeader);
      const matchedToken = match?.[1];
      if (matchedToken) {
        token = matchedToken;
      }
    }

    // 3. Fallback query parameter (?token=<JWT>)
    const queryToken = parsedUrl.searchParams.get('token');
    if (!token && queryToken) {
      if (process.env.NODE_ENV === 'production') {
        logger.warn(
          { url: parsedUrl.pathname },
          'Security Policy Violation: Persistent JWT in WebSocket URL query string blocked in production. Use tickets or cookies.',
        );
        return null;
      }
      token = queryToken;
    }

    if (!token) return null;

    // Check revocation store before accepting
    if (await tokenRevocationStore.isRevoked(token)) {
      return null;
    }

    // Verify JWT payload
    const payload = (await verify(token, JWT_SECRET, 'HS256')) as Record<string, unknown>;
    // Explicitly reject refresh tokens or non-access token types
    if (payload.type === 'refresh' || (payload.type && payload.type !== 'access')) {
      logger.warn(
        { event: 'SECURITY_AUDIT', action: 'WS_AUTH_REJECTED', reason: 'Refresh token cannot be used for WebSocket session' },
        'Auth rejected: token scope mismatch',
      );
      return null;
    }

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
