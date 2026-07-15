import type { Server } from 'node:http';
import { createApp } from './app';
import { env } from './config/env';
import { checkDatabaseConnection, closeDatabase } from './db/client';
import { logger } from './lib/logger';

async function bootstrap() {
  // Fail fast. Starting an API that cannot reach its database only defers the
  // error to the first user request, where it is far more expensive to diagnose.
  logger.info('Checking database connection…');
  if (!(await checkDatabaseConnection())) {
    logger.fatal('Cannot reach the database. Check DATABASE_URL. Exiting.');
    process.exit(1);
  }
  logger.info('Database connection established');

  const app = createApp();

  const server: Server = app.listen(env.PORT, () => {
    logger.info(
      { port: env.PORT, env: env.NODE_ENV, cors: env.CORS_ORIGINS },
      `Campus Career Hub API listening on http://localhost:${env.PORT}`,
    );
  });

  /**
   * Graceful shutdown.
   *
   * Render sends SIGTERM on every deploy. Without this, in-flight requests are
   * killed mid-write and pooled connections are left dangling. The 10s timer is
   * the backstop for a request that will not finish.
   */
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down…');

    const forceExit = setTimeout(() => {
      logger.error('Graceful shutdown timed out after 10s. Forcing exit.');
      process.exit(1);
    }, 10_000);
    forceExit.unref();

    server.close(async (err) => {
      if (err) {
        logger.error({ err }, 'Error while closing HTTP server');
        process.exit(1);
      }
      try {
        await closeDatabase();
        logger.info('Shutdown complete');
        process.exit(0);
      } catch (closeErr) {
        logger.error({ err: closeErr }, 'Error while closing the database pool');
        process.exit(1);
      }
    });
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  // A promise rejection nobody handled means we are in an unknown state.
  // Log it loudly and let the platform restart us.
  process.on('unhandledRejection', (reason) => {
    logger.fatal({ reason }, 'Unhandled promise rejection');
    void shutdown('unhandledRejection');
  });

  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Uncaught exception');
    void shutdown('uncaughtException');
  });
}

void bootstrap();
