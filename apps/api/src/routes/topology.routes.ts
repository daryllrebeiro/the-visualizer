import { zValidator } from '@hono/zod-validator';
import { BoundedDefinitionSchema } from '@the-visualizer/contracts';
import { Hono } from 'hono';
import { z } from 'zod';

import { requireAuth } from '../middleware/auth.middleware.js';
import { requireOrgRole } from '../middleware/role.middleware.js';
import { topologyRepository } from '../repositories/topology.repository.js';
import { toErrorResponse } from '../utils/errors.js';

const topologyRouter = new Hono();

// Schemas
const createTopologyBodySchema = z.object({
  orgId: z.string().uuid(),
  domainId: z.string().min(1).max(64).default('kafka').optional(),
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  visibility: z.enum(['PRIVATE', 'UNLISTED', 'PUBLIC']).optional().default('PRIVATE'),
  definition: BoundedDefinitionSchema,
});

const updateTopologyBodySchema = createTopologyBodySchema.omit({ orgId: true }).partial();

// 1. Create Topology
// Requires authentication and minimum MEMBER privileges in the target organization
topologyRouter.post(
  '/',
  requireAuth,
  zValidator('json', createTopologyBodySchema),
  // Middleware to ensure user is member of orgId supplied in JSON body
  requireOrgRole('MEMBER', (c) => {
    const body = c.req.valid('json');
    return body.orgId;
  }),
  async (c) => {
    const { orgId, domainId, name, description, visibility, definition } = c.req.valid('json');
    const user = c.get('user')!;

    try {
      const topology = await topologyRepository.createTopology(
        orgId,
        user.id,
        name,
        definition,
        description,
        visibility,
        domainId || 'kafka',
      );

      return c.json(
        {
          success: true,
          topology,
        },
        201,
      );
    } catch (err: unknown) {
      const { status, body } = toErrorResponse(err, 'Failed to create topology');
      return c.json(body, status as 403 | 404 | 409 | 500);
    }
  },
);

// 1b. List topologies for an organization (cursor-paginated, newest first)
const listTopologiesQuerySchema = z.object({
  orgId: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().max(100).optional(),
});

topologyRouter.get(
  '/',
  requireAuth,
  zValidator('query', listTopologiesQuerySchema),
  async (c) => {
    const { orgId, limit, cursor } = c.req.valid('query');
    const user = c.get('user')!;

    try {
      let parsedCursor: { createdAt: Date; id: string } | undefined;
      if (cursor) {
        const sep = cursor.indexOf('|');
        const createdAt = sep === -1 ? NaN : Date.parse(cursor.slice(0, sep));
        const id = sep === -1 ? '' : cursor.slice(sep + 1);
        if (Number.isNaN(createdAt) || !/^[0-9a-f-]{36}$/i.test(id)) {
          return c.json(
            {
              success: false,
              error: { code: 'BAD_REQUEST', message: 'Invalid pagination cursor' },
            },
            400,
          );
        }
        parsedCursor = { createdAt: new Date(createdAt), id };
      }

      const page = await topologyRepository.listTopologiesForOrgPaginated(
        orgId,
        user.id,
        limit,
        parsedCursor,
      );
      return c.json({ success: true, ...page });
    } catch (err: unknown) {
      const { status, body } = toErrorResponse(err, 'Failed to list topologies');
      return c.json(body, status as 403 | 404 | 409 | 500);
    }
  },
);

// 2. Get unlisted topology by Share Token (requires no auth)
topologyRouter.get(
  '/share/:token',
  zValidator(
    'param',
    z.object({
      token: z
        .string()
        .length(32)
        .regex(/^[A-Za-z0-9_-]+$/),
    }),
  ),
  async (c) => {
    const { token } = c.req.valid('param');
    const topology = await topologyRepository.getTopologyByShareToken(token);

    if (!topology) {
      return c.json(
        {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Topology not found or link has expired',
          },
        },
        404,
      );
    }

    return c.json({
      success: true,
      topology,
    });
  },
);

// 3. Get topology by ID (supports optional auth: public topologies are open)
topologyRouter.get(
  '/:id',
  zValidator(
    'param',
    z.object({
      id: z.string().uuid(),
    }),
  ),
  async (c) => {
    const { id } = c.req.valid('param');
    const user = c.get('user'); // Extract user if authenticate middleware ran

    const topology = await topologyRepository.getTopologyById(id, user?.id);
    if (!topology) {
      return c.json(
        {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Topology not found',
          },
        },
        404,
      );
    }

    return c.json({
      success: true,
      topology,
    });
  },
);

// 4. Update topology
// Requires authentication and minimum MEMBER privileges in the topology's organization
topologyRouter.put(
  '/:id',
  requireAuth,
  zValidator(
    'param',
    z.object({
      id: z.string().uuid(),
    }),
  ),
  zValidator('json', updateTopologyBodySchema),
  async (c) => {
    const { id } = c.req.valid('param');
    const updates = c.req.valid('json');
    const user = c.get('user')!;

    try {
      const topology = await topologyRepository.updateTopology(id, user.id, updates as any);
      return c.json({
        success: true,
        topology,
      });
    } catch (err: unknown) {
      const { status, body } = toErrorResponse(err, 'Failed to update topology');
      return c.json(body, status as 403 | 404 | 409 | 500);
    }
  },
);

// 5. Delete topology
// Requires authentication and minimum MEMBER privileges in the topology's organization
topologyRouter.delete(
  '/:id',
  requireAuth,
  zValidator(
    'param',
    z.object({
      id: z.string().uuid(),
    }),
  ),
  async (c) => {
    const { id } = c.req.valid('param');
    const user = c.get('user')!;

    try {
      await topologyRepository.deleteTopology(id, user.id);
      return c.json({
        success: true,
        message: 'Topology deleted successfully',
      });
    } catch (err: unknown) {
      const { status, body } = toErrorResponse(err, 'Failed to delete topology');
      return c.json(body, status as 403 | 404 | 409 | 500);
    }
  },
);

export { topologyRouter };
