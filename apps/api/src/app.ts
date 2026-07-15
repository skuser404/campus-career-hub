import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { env, isTest } from './config/env';
import { checkDatabaseConnection } from './db/client';
import { logger } from './lib/logger';
import { errorHandler, notFoundHandler } from './middleware/error';
import {
  JSON_BODY_LIMIT,
  csrfGuard,
  globalLimiter,
  helmetOptions,
} from './middleware/security';
import { routes } from './routes';

export function createApp(): Express {
  const app = express();

  // Render and Vercel both sit behind a proxy. Without this, req.ip is the
  // proxy's address and every rate limit becomes global rather than per-client.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet(helmetOptions));

  app.use(
    cors({
      // An explicit allowlist. A wildcard is not merely bad practice here — the
      // browser refuses to send credentials to `Access-Control-Allow-Origin: *`,
      // so cookie auth would silently stop working.
      origin(origin, callback) {
        if (!origin) return callback(null, true); // curl, server-to-server
        if (env.CORS_ORIGINS.includes(origin)) return callback(null, true);

        // `callback(null, false)`, NOT `callback(new Error(...))`.
        //
        // Throwing here produces a 500 through the generic error handler — the
        // request is still blocked, but it is logged as OUR bug rather than as a
        // rejected caller, and it pre-empts `csrfGuard`'s clean 403. Returning
        // false simply omits the Access-Control-Allow-Origin header, which is
        // what actually stops the browser, and lets the request fall through to
        // `csrfGuard` to be refused properly.
        callback(null, false);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      maxAge: 86_400,
    }),
  );

  app.use(compression());
  app.use(express.json({ limit: JSON_BODY_LIMIT }));
  app.use(express.urlencoded({ extended: true, limit: JSON_BODY_LIMIT }));
  app.use(cookieParser());

  if (!isTest) {
    app.use(
      pinoHttp({
        logger,
        autoLogging: {
          ignore: (req) => req.url === '/health',
        },
      }),
    );
  }

  app.use(globalLimiter);
  app.use(csrfGuard);

  /**
   * Health check. Render polls this; a 503 here takes the instance out of
   * rotation, which is why it reports the database's real state rather than
   * just "the process is alive".
   */
  app.get('/health', async (_req, res) => {
    const dbUp = await checkDatabaseConnection();
    res.status(dbUp ? 200 : 503).json({
      status: dbUp ? 'ok' : 'degraded',
      database: dbUp ? 'up' : 'down',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  });

  app.use('/api/v1', routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
