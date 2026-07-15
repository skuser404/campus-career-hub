import crypto from 'node:crypto';
import type { JwtPayload } from '@cch/shared';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import { unauthorized } from './errors';

const ISSUER = 'campus-career-hub';
const AUDIENCE = 'campus-career-hub-web';

/**
 * Access tokens: short-lived, signed, stateless. Verified on every request
 * without touching the database, which is why they must expire quickly — there
 * is no way to revoke one before it does.
 */
export function signAccessToken(payload: JwtPayload): { token: string; expiresAt: Date } {
  // NOTE: no `subject` option here.
  //
  // `payload` already carries `sub`, and jsonwebtoken THROWS if you also pass
  // the `subject` option — "the payload already has an 'sub' property". It is
  // one or the other, never both. Passing both made every single token mint
  // fail with a 500, which is exactly the class of bug a typecheck cannot see
  // and only an executed request reveals.
  const token = jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL,
    issuer: ISSUER,
    audience: AUDIENCE,
  } as SignOptions);

  const decoded = jwt.decode(token) as { exp: number };
  return { token, expiresAt: new Date(decoded.exp * 1000) };
}

export function verifyAccessToken(token: string): JwtPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      issuer: ISSUER,
      audience: AUDIENCE,
    }) as jwt.JwtPayload & JwtPayload;

    return { sub: decoded.sub as string, email: decoded.email, role: decoded.role };
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      // Distinct message so the web client knows to try a silent refresh
      // rather than bouncing the user to the login page.
      throw unauthorized('Your session has expired');
    }
    throw unauthorized('Invalid authentication token');
  }
}

/**
 * Refresh tokens are opaque random bytes, not JWTs.
 *
 * A JWT would carry its own validity, which makes revocation awkward. A random
 * string is meaningless without the database row that backs it, so revoking a
 * session is a single UPDATE.
 */
export function generateRefreshToken(): { token: string; hash: string; expiresAt: Date } {
  const token = crypto.randomBytes(48).toString('base64url');
  return {
    token,
    hash: hashRefreshToken(token),
    expiresAt: new Date(Date.now() + parseDuration(env.JWT_REFRESH_TTL)),
  };
}

/**
 * SHA-256, not bcrypt.
 *
 * The token is already 48 bytes of CSPRNG output, so it has no low-entropy
 * structure for bcrypt's slowness to protect. Plain SHA-256 is the right tool:
 * a stolen database still yields no usable session, and lookup stays a single
 * indexed equality check rather than a table scan of bcrypt comparisons.
 */
export const hashRefreshToken = (token: string): string =>
  crypto.createHash('sha256').update(token).digest('hex');

/** Parses `15m`, `7d`, `24h`, `30s` into milliseconds. */
export function parseDuration(input: string): number {
  const match = /^(\d+)\s*(s|m|h|d)$/i.exec(input.trim());
  if (!match) {
    throw new Error(`Invalid duration: "${input}". Use a form such as 15m, 24h, or 7d.`);
  }

  const value = Number(match[1]);
  const unit = (match[2] as string).toLowerCase();

  const multipliers: Record<string, number> = {
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };

  return value * (multipliers[unit] as number);
}
