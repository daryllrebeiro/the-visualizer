import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { ScenarioScriptSchema } from '@the-visualizer/contracts';

import { requireAuth } from '../middleware/auth.middleware.js';
import { replayRepository } from '../repositories/replay.repository.js';
import { toErrorResponse } from '../utils/errors.js';

const replayRouter = new Hono();

const saveReplayBody = z.object({
  topologyId: z.string().uuid(),
  script: ScenarioScriptSchema,
});

// Persist a replay artifact (content-addressed, de-duplicated per topology).
replayRouter.post('/', requireAuth, zValidator('json', saveReplayBody), async (c) => {
  try {
    const user = c.get('user')!;
    const { topologyId, script } = c.req.valid('json');
    const replay = await replayRepository.saveReplay({ topologyId, userId: user.id, script });
    return c.json({ success: true, replay }, 201);
  } catch (err: unknown) {
    const { status, body } = toErrorResponse(err, 'Failed to save replay');
    return c.json(body, status as 400 | 403 | 404 | 500);
  }
});

replayRouter.get(
  '/',
  requireAuth,
  zValidator('query', z.object({ topologyId: z.string().uuid() })),
  async (c) => {
    try {
      const user = c.get('user')!;
      const { topologyId } = c.req.valid('query');
      const replays = await replayRepository.listReplaysForTopology(topologyId, user.id);
      return c.json({ success: true, replays });
    } catch (err: unknown) {
      const { status, body } = toErrorResponse(err, 'Failed to list replays');
      return c.json(body, status as 403 | 404 | 500);
    }
  },
);

replayRouter.get('/:id', requireAuth, zValidator('param', z.object({ id: z.string().uuid() })), async (c) => {
  try {
    const user = c.get('user')!;
    const { id } = c.req.valid('param');
    const { replay, script } = await replayRepository.getReplay(id, user.id);
    return c.json({ success: true, replay, script });
  } catch (err: unknown) {
    const { status, body } = toErrorResponse(err, 'Failed to load replay');
    return c.json(body, status as 403 | 404 | 500);
  }
});

export { replayRouter };
