import { ERROR_CODES } from '@cch/shared';
import type { NextFunction, Request, Response } from 'express';
import rateLimit, { type Options } from 'express-rate-limit';
import { env, isTest } from '../config/env';
import { forbidden } from '../lib/errors';
import { clientIp } from '../lib/utils';

/**
 * Rate limiting.
 *
 * Disabled under NODE_ENV=test: the integration suite fires dozens of logins in
 * a second and would otherwise trip its own limiter.
 */
const baseOptions: Partial<Options> = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => clientIp(req),
  skip: () => isTest,
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      error: {
        code: ERROR_CODES.RATE_LIMITED,
        message: 'Too many requests. Please wait a moment and try again.',
      },
    });
  },
};

/**
 * Auth routes get a tight limit. Five attempts per quarter hour makes online
 * password guessing impractical without inconveniencing someone who genuinely
 * mistyped.
 *
 * `skipSuccessfulRequests` means a legitimate user who logs in correctly never
 * burns budget — only failures count.
 */
export const authLimiter = rateLimit({
  ...baseOptions,
  windowMs: 15 * 60 * 1000,
  limit: 5,
  skipSuccessfulRequests: true,
});

/** Registration is expensive (bcrypt) and a spam target, so it is limited by volume. */
export const registerLimiter = rateLimit({
  ...baseOptions,
  windowMs: 60 * 60 * 1000,
  limit: 10,
});

/** Everything else. Generous — this is a backstop against runaway clients, not a security control. */
export const globalLimiter = rateLimit({
  ...baseOptions,
  windowMs: 15 * 60 * 1000,
  limit: 500,
});

/** Writes are limited more tightly than reads. */
export const mutationLimiter = rateLimit({
  ...baseOptions,
  windowMs: 60 * 1000,
  limit: 60,
});

/**
 * CSRF defence.
 *
 * Because the web app and API are on different origins, the auth cookies must be
 * `SameSite=None` — which means the browser WILL attach them to a cross-site
 * request, and SameSite gives us no protection. So state-changing requests must
 * prove they came from an allowed origin.
 *
 * A browser sets `Origin` on every cross-origin request and forbids a page from
 * forging it. An attacker's page at evil.com therefore cannot produce a request
 * that both carries the victim's cookies and claims a legitimate Origin.
 *
 * Requests with no Origin header at all (curl, server-to-server, native apps)
 * are allowed through: they are not browsers, so there is no ambient cookie to
 * abuse, and blocking them would break the integration tests and any future
 * mobile client.
 */
export function csrfGuard(req: Request, _res: Response, next: NextFunction) {
  const isMutation = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
  if (!isMutation) return next();

  const origin = req.headers.origin;
  if (!origin) return next();

  if (!env.CORS_ORIGINS.includes(origin)) {
    return next(forbidden('Request blocked: origin not allowed'));
  }

  next();
}

/** Body size cap, so a single request cannot exhaust memory. */
export const JSON_BODY_LIMIT = '100kb';

/**
 * Content Security Policy for the API's own responses.
 *
 * The API serves JSON, not HTML, so this is deliberately draconian: if an
 * endpoint is ever tricked into reflecting HTML, nothing in it will execute.
 */
export const helmetOptions = {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'none'"],
      formAction: ["'none'"],
    },
  },
  crossOriginResourcePolicy: { policy: 'cross-origin' as const },
  referrerPolicy: { policy: 'no-referrer' as const },
  hsts: {
    maxAge: 31_536_000,
    includeSubDomains: true,
    preload: true,
  },
};
