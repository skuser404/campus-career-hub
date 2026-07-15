import {
  changePasswordSchema,
  firstLoginPasswordSchema,
  googleAuthSchema,
  loginSchema,
} from '@cch/shared';
import { Router } from 'express';
import { asyncHandler } from '../../lib/http';
import { requireAuth, requireFirstLogin } from '../../middleware/auth';
import { authLimiter } from '../../middleware/security';
import { validateBody } from '../../middleware/validate';
import * as controller from './auth.controller';

export const authRoutes: Router = Router();

/**
 * NOTE THE ABSENCE OF `POST /register`.
 *
 * There is no self-service signup. Accounts exist only because an administrator
 * imported them, which is what makes "only enrolled students may sign in"
 * enforceable rather than aspirational.
 */

// Public. Rate limited hard — this is the entire brute-force surface, and it
// matters more than usual because the initial password is a guessable USN.
authRoutes.post(
  '/login',
  authLimiter,
  validateBody(loginSchema),
  asyncHandler(controller.loginHandler),
);

// Google Sign-In. Same rate limit as password login — it is another door into
// the same house, so it gets the same lock.
authRoutes.post(
  '/google',
  authLimiter,
  validateBody(googleAuthSchema),
  asyncHandler(controller.googleHandler),
);

// Authenticated by the refresh cookie itself, not an access token — the whole
// point is that the access token has expired.
authRoutes.post('/refresh', authLimiter, asyncHandler(controller.refreshHandler));

authRoutes.post('/logout', asyncHandler(controller.logoutHandler));

/**
 * The ONE route that uses `requireFirstLogin` instead of `requireAuth`.
 *
 * It is the only door a locked-out student can open. Mounting
 * `requireFirstLogin` on any other route would silently void the lockout that
 * every other endpoint depends on.
 */
authRoutes.post(
  '/first-login',
  requireFirstLogin,
  authLimiter,
  validateBody(firstLoginPasswordSchema),
  asyncHandler(controller.firstLoginHandler),
);

// Everything below requires a fully set-up account.
authRoutes.get('/me', requireAuth, asyncHandler(controller.meHandler));

authRoutes.post(
  '/change-password',
  requireAuth,
  authLimiter,
  validateBody(changePasswordSchema),
  asyncHandler(controller.changePasswordHandler),
);

authRoutes.get('/sessions', requireAuth, asyncHandler(controller.sessionsHandler));

authRoutes.post(
  '/sessions/revoke-all',
  requireAuth,
  asyncHandler(controller.revokeSessionsHandler),
);
