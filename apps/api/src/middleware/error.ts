import { ERROR_CODES, type ApiFailure } from '@cch/shared';
import type { NextFunction, Request, Response } from 'express';
import { isProduction } from '../config/env';
import { AppError, mapDatabaseError, notFound } from '../lib/errors';
import { logger } from '../lib/logger';

/** Terminal 404 for an unmatched route. */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction) {
  next(notFound(`Route ${req.method} ${req.path}`));
}

/**
 * The single exit point for every failure in the application.
 *
 * Two rules:
 *  1. An expected failure (AppError, or a database constraint we recognise)
 *     returns its real message — the user can act on it.
 *  2. Anything else is logged in full and returned as a bare 500. An unexpected
 *     throw may carry a connection string or a row of user data in its message,
 *     so it never reaches the client.
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // Required: Express identifies error middleware by its four-argument shape.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
) {
  const appError =
    err instanceof AppError ? err : mapDatabaseError(err);

  if (appError) {
    // 5xx is our bug; 4xx is the caller's. Log accordingly.
    const level = appError.statusCode >= 500 ? 'error' : 'warn';
    logger[level](
      {
        err,
        code: appError.code,
        statusCode: appError.statusCode,
        method: req.method,
        path: req.path,
        userId: req.user?.sub,
      },
      appError.message,
    );

    const body: ApiFailure = {
      success: false,
      error: {
        code: appError.code,
        message: appError.message,
        ...(appError.details ? { details: appError.details } : {}),
      },
    };

    return res.status(appError.statusCode).json(body);
  }

  // Unrecognised. This is a bug in our code.
  logger.error(
    {
      err,
      method: req.method,
      path: req.path,
      userId: req.user?.sub,
    },
    'Unhandled error',
  );

  const body: ApiFailure = {
    success: false,
    error: {
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'Something went wrong on our end. Please try again.',
      // The real message is exposed in development only — in production it is
      // exactly the kind of thing that leaks internals to an attacker.
      ...(isProduction
        ? {}
        : {
            details: [
              {
                path: 'debug',
                message: err instanceof Error ? err.message : String(err),
              },
            ],
          }),
    },
  };

  res.status(500).json(body);
}
