import { parseEnv, ApiEnvSchema } from '@the-visualizer/config';
import type { ApiEnv } from '@the-visualizer/config';

export const config = parseEnv(ApiEnvSchema) as ApiEnv;

// Ensure we have a valid JWT_SECRET
export const JWT_SECRET = config.JWT_SECRET || config.SESSION_SECRET;
