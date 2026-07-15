import type {
  AuthResponse,
  ChangePasswordInput,
  FirstLoginPasswordInput,
  GoogleAuthInput,
  LoginInput,
} from '@cch/shared';
import type { Request, Response } from 'express';
import { audit } from '../../lib/audit';
import { unauthorized } from '../../lib/errors';
import {
  REFRESH_COOKIE,
  clearAuthCookies,
  noContent,
  ok,
  setAuthCookies,
} from '../../lib/http';
import { clientIp } from '../../lib/utils';
import * as service from './auth.service';

const sessionContext = (req: Request) => ({
  userAgent: req.headers['user-agent'],
  ip: clientIp(req),
});

/**
 * There is no `registerHandler`. Accounts are created by admin import only.
 * See `modules/students` for the one path that brings a user into existence.
 */

export async function loginHandler(req: Request, res: Response) {
  const input = req.body as LoginInput;

  const session = await service.login(input, sessionContext(req));
  setAuthCookies(res, session.accessToken, session.refreshToken);

  await audit(req, 'login', 'user', session.user.id, {
    email: session.user.email,
    firstLogin: session.user.mustChangePassword,
  });

  const body: AuthResponse = {
    user: session.user,
    accessTokenExpiresAt: session.accessTokenExpiresAt,
    // Hoisted so the client can branch on it without digging into `user`. When
    // true, the ONLY endpoint this session can reach is /auth/first-login.
    mustChangePassword: session.user.mustChangePassword,
  };

  return ok(res, body);
}

export async function googleHandler(req: Request, res: Response) {
  const { credential } = req.body as GoogleAuthInput;

  const session = await service.loginWithGoogle(credential, sessionContext(req));
  setAuthCookies(res, session.accessToken, session.refreshToken);

  await audit(req, 'login', 'user', session.user.id, {
    email: session.user.email,
    method: 'google',
  });

  const body: AuthResponse = {
    user: session.user,
    accessTokenExpiresAt: session.accessTokenExpiresAt,
    // Always false for a Google sign-in: the USN password is retired on the way
    // in, so there is nothing left to force.
    mustChangePassword: false,
  };

  return ok(res, body);
}

/** The forced first-login change. The only route reachable while locked out. */
export async function firstLoginHandler(req: Request, res: Response) {
  const input = req.body as FirstLoginPasswordInput;
  const currentRefresh = req.cookies?.[REFRESH_COOKIE] as string | undefined;

  const user = await service.completeFirstLogin(
    req.user!.sub,
    input.newPassword,
    currentRefresh,
  );

  await audit(req, 'password_change', 'user', user.id, { firstLogin: true });

  return ok(res, {
    user,
    message: 'Password set. Other devices have been signed out.',
  });
}

export async function refreshHandler(req: Request, res: Response) {
  const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
  if (!token) throw unauthorized('No session to refresh. Please sign in.');

  const session = await service.refresh(token, sessionContext(req));
  setAuthCookies(res, session.accessToken, session.refreshToken);

  const body: AuthResponse = {
    user: session.user,
    accessTokenExpiresAt: session.accessTokenExpiresAt,
    mustChangePassword: session.user.mustChangePassword,
  };

  return ok(res, body);
}

export async function logoutHandler(req: Request, res: Response) {
  const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;

  await service.logout(token);
  clearAuthCookies(res);

  // Logout always succeeds, even with no valid session. Reporting "you were not
  // signed in" would be a pointless error for the user and an oracle for an attacker.
  return noContent(res);
}

export async function meHandler(req: Request, res: Response) {
  return ok(res, await service.getById(req.user!.sub));
}

export async function changePasswordHandler(req: Request, res: Response) {
  const input = req.body as ChangePasswordInput;
  const currentRefresh = req.cookies?.[REFRESH_COOKIE] as string | undefined;

  await service.changePassword(
    req.user!.sub,
    input.currentPassword,
    input.newPassword,
    currentRefresh,
  );

  await audit(req, 'password_change', 'user', req.user!.sub);

  return ok(res, { message: 'Password updated. Other devices have been signed out.' });
}

export async function sessionsHandler(req: Request, res: Response) {
  return ok(res, await service.listSessions(req.user!.sub));
}

export async function revokeSessionsHandler(req: Request, res: Response) {
  await service.revokeAllSessions(req.user!.sub);
  clearAuthCookies(res);
  return ok(res, { message: 'Signed out of all devices.' });
}
