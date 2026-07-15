import path from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { logger } from '../lib/logger';
import { checkDatabaseConnection, closeDatabase, db } from './client';

/**
 * Migration runner.
 *
 * Runs as Render's pre-deploy command, so schema changes land before the code
 * that depends on them. Drizzle records applied migrations in
 * `__drizzle_migrations`, so running this repeatedly is safe.
 */
async function main() {
  logger.info('Checking database connection…');

  if (!(await checkDatabaseConnection())) {
    logger.error('Could not connect to the database. Is DATABASE_URL correct?');
    process.exit(1);
  }

  logger.info('Connected. Applying migrations…');

  const migrationsFolder = path.resolve(__dirname, 'migrations');
  await migrate(db, { migrationsFolder });

  logger.info('✓ Migrations applied successfully');
}

main()
  .catch((err) => {
    logger.error({ err }, '✗ Migration failed');
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
