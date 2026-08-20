import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import type { KafkaClusterState } from '@the-visualizer/contracts';

import { requireAuth } from '../middleware/auth.middleware.js';
import { requireOrgRole } from '../middleware/role.middleware.js';
import { topologyRepository } from '../repositories/topology.repository.js';

const topologyRouter = new Hono();

// Schemas
const createTopologyBodySchema = z.object({
  orgId: z.string().uuid(),
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  visibility: z.enum(['PRIVATE', 'UNLISTED', 'PUBLIC']).optional().default('PRIVATE'),
  definition: z.record(z.string(), z.unknown()) as any,
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
    const { orgId, name, description, visibility, definition } = c.req.valid('json');
    const user = c.get('user')!;

    try {
      const topology = await topologyRepository.createTopology(
        orgId,
        user.id,
        name,
        definition as KafkaClusterState,
        description,
        visibility,
      );

      return c.json({
        success: true,
        topology,
      });
    } catch (err: any) {
      return c.json(
        {
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: err.message || 'Failed to create topology',
          },
        },
        500,
      );
    }
  },
);

// 2. Get unlisted topology by Share Token (requires no auth)
topologyRouter.get('/share/:token', async (c) => {
  const token = c.req.param('token');
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
});

// 3. Get topology by ID (supports optional auth: public topologies are open)
topologyRouter.get('/:id', async (c) => {
  const id = c.req.param('id');
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
});

// 4. Update topology
// Requires authentication and minimum MEMBER privileges in the topology's organization
topologyRouter.put('/:id', requireAuth, zValidator('json', updateTopologyBodySchema), async (c) => {
  const id = c.req.param('id');
  const updates = c.req.valid('json');
  const user = c.get('user')!;

  try {
    const topology = await topologyRepository.updateTopology(id, user.id, updates as any);
    return c.json({
      success: true,
      topology,
    });
  } catch (err: any) {
    if (err.message?.includes('Unauthorized') || err.message?.includes('rights')) {
      return c.json(
        {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: err.message,
          },
        },
        403,
      );
    }
    return c.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: err.message || 'Failed to update topology',
        },
      },
      500,
    );
  }
});

// 5. Delete topology
// Requires authentication and minimum MEMBER privileges in the topology's organization
topologyRouter.delete('/:id', requireAuth, async (c) => {
  const id = c.req.param('id');
  const user = c.get('user')!;

  try {
    await topologyRepository.deleteTopology(id, user.id);
    return c.json({
      success: true,
      message: 'Topology deleted successfully',
    });
  } catch (err: any) {
    if (err.message?.includes('Unauthorized') || err.message?.includes('rights')) {
      return c.json(
        {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: err.message,
          },
        },
        403,
      );
    }
    return c.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: err.message || 'Failed to delete topology',
        },
      },
      500,
    );
  }
});

export { topologyRouter };
