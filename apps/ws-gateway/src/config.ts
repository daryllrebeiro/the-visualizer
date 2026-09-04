import { z } from 'zod';

import { BaseEnvSchema, RedisEnvSchema, parseEnv } from '@the-visualizer/config';

const WsGatewayEnvSchema = BaseEnvSchema.merge(RedisEnvSchema)
  .merge(
    z.object({
      PORT: z.coerce.number().int().positive().default(3001),
      SESSION_SECRET: z.string().min(32),
      JWT_SECRET: z.string().min(32).optional(),
    }),
  )
  .passthrough();

export type WsGatewayEnv = z.infer<typeof WsGatewayEnvSchema>;

export const config = parseEnv(WsGatewayEnvSchema) as WsGatewayEnv;
export const JWT_SECRET = config.JWT_SECRET ?? config.SESSION_SECRET;
