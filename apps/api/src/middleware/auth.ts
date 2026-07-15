import type { JwtPayload, UserRole } from '@cch/shared';
import { eq } from 'drizzle-orm';
import type { NextFunction, Request, Response } from 'express';
import { db } from '../db/client';
import { users } from '../db/schema';
import { accountDisabled, forbidden, passwordChangeRequired, unauthorized } from '../lib/errors';
import { ACCESS_COOKIE } from '../lib/http';
import { verifyAccessToken } from '../lib/jwt';

/**
 * The authenticated caller, as every downstream handler sees them.
 *
 * `departmentId` and `year` are here because they are ACCESS-CONTROL INPUTS, not
 * profile decoration — they decide which opportunities the student is permitted
 * to see. They are read from the database row on every request rather than
 * carried in the JWT, so that an admin correcting a mis-imported branch takes
 * effect immediately instead of lingering for the life of a 15-minute token.
 */
export interface AuthUser extends JwtPayload {
  departmentId: string | null;
  year: number | null;
  mustChangePassword: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

function extractToken(req: Request): string | null {
  const cookieToken = req.cookies?.[ACCESS_COOKIE];
  if (typeof cookieToken === 'string' && cookieToken.length > 0) return cookieToken;

  // The Bearer fallback exists so curl, Postman and the integration tests can
  // authenticate. The browser always uses the httpOnly cookie.
  const header = req.headers.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) return header.slice(7);

  return null;
}

/**
 * Load the account fresh from the database and apply every account-level gate.
 *
 * Shared by `requireAuth` and `requireFirstLogin` so the two cannot drift — the
 * only difference between them is whether `mustChangePassword` is fatal.
 */
async function loadAccount(req: Request): Promise<AuthUser> {
  const token = extractToken(req);
  if (!token) throw unauthorized('You must be signed in to do that');

  const payload = verifyAccessToken(token);

  const [account] = await db
    .select({
      id: users.id,
      email: users.email,
      role: users.role,
      isActive: users.isActive,
      departmentId: users.departmentId,
      year: users.year,
      mustChangePassword: users.mustChangePassword,
    })
    .from(users)
    .where(eq(users.id, payload.sub))
    .limit(1);

  if (!account) throw unauthorized('Your account no longer exists');

  // A token minted before the account was disabled is still cryptographically
  // valid. Only the row knows the truth, which is why we read it every time.
  if (!account.isActive) throw accountDisabled();

  return {
    sub: account.id,
    email: account.email,
    // Role comes from the row, not the token: a demotion takes effect at once
    // rather than lingering until the old access token expires.
    role: account.role,
    departmentId: account.departmentId,
    year: account.year,
    mustChangePassword: account.mustChangePassword,
  };
}

/**
 * The main gate. Everything behind it has a verified, active, password-set user.
 *
 * The `mustChangePassword` check is what turns "please change your password" from
 * a suggestion into a fact. A student still holding their USN as a password is
 * locked out of EVERY endpoint except the one that lets them change it — so a
 * classmate who guessed the USN and signed in first can read nothing.
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const user = await loadAccount(req);

    if (user.mustChangePassword) throw passwordChangeRequired();

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * The ONLY gate that tolerates `mustChangePassword`.
 *
 * Mounted on exactly one route — POST /auth/first-login — so the student can
 * escape the lockout. Mount it anywhere else and the lockout is worthless.
 */
export async function requireFirstLogin(req: Request, _res: Response, next: NextFunction) {
  try {
    req.user = await loadAccount(req);
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Soft gate. Attaches `req.user` when a valid token is present, otherwise carries
 * on anonymously.
 *
 * A user mid-password-change is treated as ANONYMOUS here rather than as
 * themselves — they must not receive department-gated content until the change
 * is done.
 */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const user = await loadAccount(req);
    if (!user.mustChangePassword) req.user = user;
  } catch {
    // An expired or malformed token on a public route is not an error —
    // the caller is simply anonymous.
  }
  next();
}

/**
 * Role gate. Always mount AFTER `requireAuth`.
 *
 * This is the authorisation boundary that matters. The Next.js middleware merely
 * redirects for a nicer experience; it can be bypassed by anyone with curl, so it
 * is never load-bearing.
 */
export function requireRole(...allowed: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized());
    if (!allowed.includes(req.user.role)) {
      return next(forbidden('You do not have permission to do that'));
    }
    next();
  };
}

export const requireAdmin = requireRole('admin');
