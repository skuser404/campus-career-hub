import type { ApiSuccess, PaginationMeta } from '@cch/shared';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { env, isProduction } from '../config/env';
import { parseDuration } from './jwt';

/**
 * Wrap an async handler so a rejected promise reaches the error middleware.
 *
 * Express 4 does not await handlers, so without this an async throw becomes an
 * unhandled rejection and the request hangs until it times out.
 */
export const asyncHandler =
  <T extends RequestHandler>(fn: T): RequestHandler =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

export function ok<T>(res: Response, data: T, pagination?: PaginationMeta): Response {
  const body: ApiSuccess<T> = {
    success: true,
    data,
    ...(pagination ? { meta: { pagination } } : {}),
  };
  return res.status(200).json(body);
}

export function created<T>(res: Response, data: T): Response {
  const body: ApiSuccess<T> = { success: true, data };
  return res.status(201).json(body);
}

export function noContent(res: Response): Response {
  return res.status(204).send();
}

/**
 * Auth cookie settings.
 *
 * `httpOnly`  — JavaScript cannot read the token, so an XSS bug cannot steal a session.
 * `secure`    — HTTPS only in production.
 * `sameSite`  — 'none' in production because Vercel (web) and Render (API) are
 *               different sites and the cookie must survive the cross-site request.
 *               That removes SameSite as a CSRF defence, which is precisely why
 *               `csrfGuard` checks the Origin header on every mutation.
 * `path`      — the refresh cookie is scoped to the refresh and logout routes, so
 *               it is not attached to ordinary API calls and cannot leak from them.
 */
function cookieBase() {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: (isProduction ? 'none' : 'lax') as 'none' | 'lax',
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
  };
}

export const ACCESS_COOKIE = 'cch_access';
export const REFRESH_COOKIE = 'cch_refresh';

const REFRESH_PATH = '/api/v1/auth';

export function setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
  res.cookie(ACCESS_COOKIE, accessToken, {
    ...cookieBase(),
    path: '/',
    maxAge: parseDuration(env.JWT_ACCESS_TTL),
  });

  res.cookie(REFRESH_COOKIE, refreshToken, {
    ...cookieBase(),
    path: REFRESH_PATH,
    maxAge: parseDuration(env.JWT_REFRESH_TTL),
  });
}

export function clearAuthCookies(res: Response): void {
  // The clearing cookie must match the original's path and domain exactly,
  // or the browser keeps the old one and "logout" silently does nothing.
  res.clearCookie(ACCESS_COOKIE, { ...cookieBase(), path: '/' });
  res.clearCookie(REFRESH_COOKIE, { ...cookieBase(), path: REFRESH_PATH });
}
