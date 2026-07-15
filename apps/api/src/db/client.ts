import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { env, isProduction } from '../config/env';
import { logger } from '../lib/logger';
import * as schema from './schema';

/**
 * Connection pool.
 *
 * Managed Postgres (Render, Neon, Supabase) terminates non-TLS connections, so
 * SSL is on whenever the URL is not localhost. `rejectUnauthorized: false` is
 * required because these providers front the database with a certificate whose
 * CA is not in Node's default trust store; the transport is still encrypted.
 */
const needsSsl =
  isProduction ||
  (!env.DATABASE_URL.includes('localhost') && !env.DATABASE_URL.includes('127.0.0.1'));

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  ...(needsSsl ? { ssl: { rejectUnauthorized: false } } : {}),
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (err) => {
  // An idle client erroring out must not take the process down.
  logger.error({ err }, 'Unexpected error on idle database client');
});

export const db = drizzle(pool, { schema, logger: false });

export type Database = typeof db;

/** Used by the /health endpoint and by the migration runner's preflight. */
export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    const client = await pool.connect();
    try {
      await client.query('SELECT 1');
      return true;
    } finally {
      client.release();
    }
  } catch (err) {
    logger.error({ err }, 'Database connection check failed');
    return false;
  }
}

export async function closeDatabase(): Promise<void> {
  await pool.end();
}

export { schema };
