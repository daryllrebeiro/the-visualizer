import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { db } from '../db/index.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { orgRepository } from '../repositories/org.repository.js';

const orgRouter = new Hono();

// Apply auth requirement to all org routes
orgRouter.use('*', requireAuth);

const createOrgSchema = z.object({
  slug: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase kebab-case'),
  name: z.string().min(1).max(255),
});

orgRouter.post('/', zValidator('json', createOrgSchema), async (c) => {
  const { slug, name } = c.req.valid('json');
  const user = c.get('user')!;

  try {
    // Create org and add membership as OWNER atomically in a transaction
    const org = await db.transaction(async () => {
      const newOrg = await orgRepository.createOrg(slug, name);
      await orgRepository.addMember(user.id, newOrg.id, 'OWNER');
      return newOrg;
    });

    return c.json({
      success: true,
      org,
    });
  } catch (err: any) {
    if (err.message?.includes('duplicate key')) {
      return c.json(
        {
          success: false,
          error: {
            code: 'CONFLICT',
            message: 'An organization with this slug already exists',
          },
        },
        409,
      );
    }

    return c.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to create organization',
        },
      },
      500,
    );
  }
});

orgRouter.get('/', async (c) => {
  const user = c.get('user')!;
  const orgs = await orgRepository.getUserOrgs(user.id);
  return c.json({
    success: true,
    orgs,
  });
});

export { orgRouter };
