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
// Same key-confusion rule as the API: distinct JWT_SECRET required in prod.
export const JWT_SECRET = config.JWT_SECRET ?? config.SESSION_SECRET;

if (!config.JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set explicitly in production (SESSION_SECRET fallback refused)');
  }
  console.warn(
    '[security] JWT_SECRET is unset — falling back to SESSION_SECRET for local dev only. Set a distinct JWT_SECRET.',
  );
}
