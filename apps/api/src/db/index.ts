import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool, defaults } from 'pg';

import { type ApiEnv, ApiEnvSchema, parseEnv } from '@the-visualizer/config';

import * as schema from './schema.js';

// Parse and validate environment configurations
const env = parseEnv(ApiEnvSchema) as ApiEnv;

// Set statement timeout default at pg pool driver level
defaults.statement_timeout = env.DATABASE_STATEMENT_TIMEOUT_MS;

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  min: env.DATABASE_POOL_MIN,
  max: env.DATABASE_POOL_MAX,
});

export const db = drizzle(pool, { schema });

/**
 * Execute db operations inside a transaction context populated with the authenticated user ID.
 * This sets a transaction-local variable `app.current_user_id` so that custom Postgres RLS policies
 * can safely read the session context during execution.
 */
export async function executeInTransactionWithUser<T>(
  userId: string,
  fn: (tx: typeof db) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    // Set local transaction parameter
    await tx.execute(sql`SET LOCAL app.current_user_id = ${userId}`);
    return fn(tx as any);
  });
}
