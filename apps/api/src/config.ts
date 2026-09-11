import { ApiEnvSchema, parseEnv } from '@the-visualizer/config';
import type { ApiEnv } from '@the-visualizer/config';

export const config = parseEnv(ApiEnvSchema) as ApiEnv;

// Ensure we have a valid JWT_SECRET. Falling back to SESSION_SECRET for token
// signing is a key-confusion risk: refuse it in production, warn loudly in dev.
export const JWT_SECRET = config.JWT_SECRET || config.SESSION_SECRET;

if (!config.JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set explicitly in production (SESSION_SECRET fallback refused)');
  }
  console.warn(
    '[security] JWT_SECRET is unset — falling back to SESSION_SECRET for local dev only. Set a distinct JWT_SECRET.',
  );
}
