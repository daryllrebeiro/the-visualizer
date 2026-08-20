import type { MiddlewareHandler } from 'hono';

import { orgRepository } from '../repositories/org.repository.js';
import type { UserContextPayload } from './auth.middleware.js';

export function requireOrgRole(
  minRole: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER',
  getOrgId: (c: any) => string | undefined = (c) =>
    c.req.param('orgId') ||
    c.req.query('orgId') ||
    (c.req.valid ? (c.req.valid('json') as any)?.orgId : undefined),
): MiddlewareHandler {
  const roleHierarchy = {
    OWNER: 4,
    ADMIN: 3,
    MEMBER: 2,
    VIEWER: 1,
  };

  return async (c, next) => {
    const user = c.get('user') as UserContextPayload | undefined;
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

    const orgId = getOrgId(c);
    if (!orgId) {
      return c.json(
        {
          success: false,
          error: {
            code: 'BAD_REQUEST',
            message: 'Organization identifier is missing',
          },
        },
        400,
      );
    }

    // Retrieve user membership
    const membership = await orgRepository.getMembership(user.id, orgId);
    if (!membership) {
      return c.json(
        {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'User is not a member of this organization',
          },
        },
        403,
      );
    }

    const userRoleValue = roleHierarchy[membership.role as keyof typeof roleHierarchy];
    const minRoleValue = roleHierarchy[minRole];

    if (userRoleValue < minRoleValue) {
      return c.json(
        {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: `Insufficient privileges: requires at least ${minRole}`,
          },
        },
        403,
      );
    }

    return await next();
  };
}
