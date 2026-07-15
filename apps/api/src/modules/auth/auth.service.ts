import crypto from 'node:crypto';
import {
  COLLEGE_EMAIL_DOMAIN,
  isCollegeEmail,
  normalizeUsn,
  type LoginInput,
  type PublicUser,
} from '@cch/shared';
import { and, eq, gt, isNull, lt, ne, or } from 'drizzle-orm';
import { db } from '../../db/client';
import { departments, refreshTokens, users } from '../../db/schema';
import { forbidden, passwordChangeRequired, unauthorized } from '../../lib/errors';
import { verifyGoogleIdToken } from '../../lib/google';
import { generateRefreshToken, hashRefreshToken, signAccessToken } from '../../lib/jwt';
import { logger } from '../../lib/logger';
import { DUMMY_HASH, hashPassword, verifyPassword } from '../../lib/password';

/**
 * There is NO `register` function in this file, and that is the security model.
 *
 * An account exists only because an administrator imported it. Every other
 * system in this codebase — department gating, notifications, analytics — assumes
 * that the set of users equals the set of enrolled students, and a self-service
 * signup would quietly break that assumption for every one of them.
 */

/** The joined shape we read for a user, including their department. */
const userColumns = {
  id: users.id,
  email: users.email,
  passwordHash: users.passwordHash,
  fullName: users.fullName,
  usn: users.usn,
  role: users.role,
  year: users.year,
  section: users.section,
  batch: users.batch,
  phone: users.phone,
  avatarUrl: users.avatarUrl,
  isActive: users.isActive,
  mustChangePassword: users.mustChangePassword,
  lastLoginAt: users.lastLoginAt,
  createdAt: users.createdAt,
  departmentId: departments.id,
  departmentCode: departments.code,
  departmentName: departments.name,
};

/**
 * Declared explicitly rather than derived from the columns.
 *
 * A mapped type over `userColumns` reads each column's `notNull` flag — and
 * `departments.id` IS not-null in its own table. But this is a LEFT JOIN, so a
 * user with no department yields nulls for all three department columns
 * regardless of how they are declared. Deriving the type would confidently
 * assert `departmentCode: string` for a row where it is `null`, and the compiler
 * would then wave through the exact null dereference it exists to prevent.
 */
export interface UserJoined {
  id: string;
  email: string;
  passwordHash: string;
  fullName: string;
  usn: string | null;
  role: 'student' | 'admin';
  year: number | null;
  section: string | null;
  batch: string | null;
  phone: string | null;
  avatarUrl: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  departmentId: string | null;
  departmentCode: string | null;
  departmentName: string | null;
}

/**
 * Strip the hash. This is the ONLY function that turns a row into a response.
 *
 * Accepts a structural subset, so the students list — which selects the same
 * shape plus a couple of counts — can reuse it rather than growing a second,
 * subtly different serialiser that one day forgets to omit `passwordHash`.
 */
export function toPublicUser(row: Omit<UserJoined, 'passwordHash'>): PublicUser {
  return {
    id: row.id,
    email: row.email,
    fullName: row.fullName,
    usn: row.usn,
    role: row.role,
    department: row.departmentId
      ? {
          id: row.departmentId,
          code: row.departmentCode as string,
          name: row.departmentName as string,
        }
      : null,
    year: row.year,
    section: row.section,
    batch: row.batch,
    phone: row.phone,
    avatarUrl: row.avatarUrl,
    isActive: row.isActive,
    mustChangePassword: row.mustChangePassword,
    lastLoginAt: row.lastLoginAt,
    createdAt: row.createdAt,
  };
}

async function findByEmail(email: string): Promise<UserJoined | undefined> {
  const [row] = await db
    .select(userColumns)
    .from(users)
    .leftJoin(departments, eq(users.departmentId, departments.id))
    .where(eq(users.email, email.trim().toLowerCase()))
    .limit(1);

  return row;
}

export async function findById(id: string): Promise<UserJoined | undefined> {
  const [row] = await db
    .select(userColumns)
    .from(users)
    .leftJoin(departments, eq(users.departmentId, departments.id))
    .where(eq(users.id, id))
    .limit(1);

  return row;
}

interface SessionContext {
  userAgent?: string | undefined;
  ip?: string | undefined;
}

interface IssuedSession {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: Date;
}

async function issueSession(row: UserJoined, ctx: SessionContext): Promise<IssuedSession> {
  const { token: accessToken, expiresAt: accessTokenExpiresAt } = signAccessToken({
    sub: row.id,
    email: row.email,
    role: row.role,
  });

  const refresh = generateRefreshToken();

  await db.insert(refreshTokens).values({
    userId: row.id,
    tokenHash: refresh.hash,
    expiresAt: refresh.expiresAt,
    userAgent: ctx.userAgent ?? null,
    ip: ctx.ip ?? null,
  });

  return {
    user: toPublicUser(row),
    accessToken,
    refreshToken: refresh.token,
    accessTokenExpiresAt,
  };
}

/**
 * Sign in.
 *
 * A session IS issued when `mustChangePassword` is true — the student needs a
 * token to be able to call the change-password endpoint at all. What protects
 * them is that `requireAuth` then refuses that token everywhere else, so the
 * only door it opens is the one marked "change your password".
 */
export async function login(input: LoginInput, ctx: SessionContext): Promise<IssuedSession> {
  const email = input.email.trim().toLowerCase();

  // Guard #2 of three (Zod is #1, the DB CHECK is #3). Belt and braces, because
  // the cost of being wrong here is an outsider inside a closed system.
  if (!isCollegeEmail(email)) {
    throw unauthorized(`Sign in with your college email (@${COLLEGE_EMAIL_DOMAIN})`);
  }

  const row = await findByEmail(email);

  /**
   * Hash against a dummy when the account is absent, so a request for an unknown
   * email costs the same ~250ms as one for a known email.
   *
   * This matters more here than in an open system: the set of valid emails IS the
   * student roll, so a timing oracle would let an outsider enumerate who attends
   * the university.
   */
  const passwordOk = await verifyPassword(input.password, row?.passwordHash ?? DUMMY_HASH);

  // One message for both failure modes. "No such account" versus "wrong password"
  // is an enumeration oracle.
  if (!row || !passwordOk) {
    throw unauthorized('Incorrect email or password');
  }

  if (!row.isActive) {
    throw forbidden('Your account has been disabled. Contact the placement office.');
  }

  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, row.id));

  return issueSession({ ...row, lastLoginAt: new Date() }, ctx);
}

/**
 * Sign in with Google — AUTO-CREATE model.
 *
 * The identity is verified by Google; belonging is decided by the email domain
 * alone. Any `@jainuniversity.ac.in` Google account is a student here, and one
 * that has never signed in before is created on the spot from the verified
 * Google profile (name, email, photo). The domain IS the guest list — there is
 * no import roll to check against.
 *
 * An admin account that already exists keeps its role and its password login;
 * signing in with Google never demotes anyone.
 */
export async function loginWithGoogle(
  credential: string,
  ctx: SessionContext,
): Promise<IssuedSession> {
  const identity = await verifyGoogleIdToken(credential);

  if (!identity.emailVerified) {
    throw forbidden('Your Google account email is not verified.');
  }

  // The ONLY gate: the college domain. This is what keeps the whole internet out
  // while letting every genuine student in without an admin lifting a finger.
  if (!isCollegeEmail(identity.email)) {
    throw forbidden(
      `Sign in with your college Google account (@${COLLEGE_EMAIL_DOMAIN}), not a personal one.`,
    );
  }

  const existing = await findByEmail(identity.email);

  if (existing) {
    if (!existing.isActive) {
      throw forbidden('Your account has been disabled. Contact the placement office.');
    }

    // Refresh the profile from Google (a student may have changed their photo or
    // display name) and record the visit. Role is left untouched — an admin stays
    // an admin.
    await db
      .update(users)
      .set({
        fullName: identity.name ?? existing.fullName,
        avatarUrl: identity.picture ?? existing.avatarUrl,
        lastLoginAt: new Date(),
        // A returning account should never be stuck behind the forced-change gate.
        mustChangePassword: false,
        updatedAt: new Date(),
      })
      .where(eq(users.id, existing.id));

    logger.info({ userId: existing.id }, 'Existing account signed in with Google');

    const refreshed = await findById(existing.id);
    return issueSession(refreshed as UserJoined, ctx);
  }

  // First time: mint the account from the verified Google identity.
  //
  // There is no password to set — this account will only ever authenticate
  // through Google — so the stored hash is unguessable random bytes purely to
  // satisfy the NOT NULL column, and `mustChangePassword` is false.
  const [created] = await db
    .insert(users)
    .values({
      email: identity.email,
      passwordHash: await hashPassword(crypto.randomBytes(32).toString('base64url')),
      fullName: identity.name ?? identity.email.split('@')[0] ?? 'Student',
      role: 'student',
      avatarUrl: identity.picture ?? null,
      mustChangePassword: false,
      lastLoginAt: new Date(),
    })
    .returning({ id: users.id });

  if (!created) throw forbidden('Could not create your account. Please try again.');

  logger.info({ userId: created.id, email: identity.email }, 'New student auto-created via Google');

  const row = await findById(created.id);
  return issueSession(row as UserJoined, ctx);
}

/**
 * The forced first-login password change.
 *
 * There is no "current password" argument, because the current password is the
 * student's USN — printed on their ID card, listed in every class spreadsheet,
 * and therefore not a secret. Asking them to re-enter it would be security
 * theatre. The authorisation here comes from holding a valid session for that
 * account, which is the real proof.
 */
export async function completeFirstLogin(
  userId: string,
  newPassword: string,
  currentRefreshToken?: string,
): Promise<PublicUser> {
  const row = await findById(userId);
  if (!row) throw unauthorized('Your account no longer exists');

  if (!row.mustChangePassword) {
    // Already done. Calling this twice must not be a way to skip the real
    // change-password flow (which DOES verify the current password).
    throw forbidden('Your password has already been set. Use Settings to change it.');
  }

  // Refusing to let the USN be re-used as the "new" password is the entire point
  // of the exercise — otherwise the student ends the flow exactly where they started.
  if (row.usn && normalizeUsn(newPassword) === normalizeUsn(row.usn)) {
    throw forbidden('Your new password cannot be your USN. Choose something only you know.');
  }

  const passwordHash = await hashPassword(newPassword);

  await db
    .update(users)
    .set({ passwordHash, mustChangePassword: false, updatedAt: new Date() })
    .where(eq(users.id, userId));

  // Kill every other session. If someone guessed the USN and signed in first,
  // this is the moment they are thrown out.
  const keepHash = currentRefreshToken ? hashRefreshToken(currentRefreshToken) : null;

  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(refreshTokens.userId, userId),
        isNull(refreshTokens.revokedAt),
        keepHash ? ne(refreshTokens.tokenHash, keepHash) : undefined,
      ),
    );

  logger.info({ userId }, 'Student completed forced first-login password change');

  const updated = await findById(userId);
  return toPublicUser(updated as UserJoined);
}

/**
 * Rotate a refresh token.
 *
 * The old token is revoked and a new one issued on every call, so a stolen token
 * has a short useful life. If a token that has ALREADY been rotated is presented,
 * two parties hold it — the legitimate user and a thief — so every session for
 * that user is revoked and both are forced to sign in again.
 */
export async function refresh(rawToken: string, ctx: SessionContext): Promise<IssuedSession> {
  const tokenHash = hashRefreshToken(rawToken);

  const [existing] = await db
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, tokenHash))
    .limit(1);

  if (!existing) {
    throw unauthorized('Your session is no longer valid. Please sign in again.');
  }

  if (existing.revokedAt !== null) {
    logger.warn(
      { userId: existing.userId, tokenId: existing.id, ip: ctx.ip },
      'Refresh token reuse detected — revoking every session for this user',
    );

    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.userId, existing.userId), isNull(refreshTokens.revokedAt)));

    throw unauthorized('Your session was revoked for security reasons. Please sign in again.');
  }

  if (existing.expiresAt <= new Date()) {
    throw unauthorized('Your session has expired. Please sign in again.');
  }

  const row = await findById(existing.userId);
  if (!row) throw unauthorized('Your account no longer exists');
  if (!row.isActive) throw forbidden('Your account has been disabled');

  // Revoke first, then issue. If the process dies between the two the user is
  // logged out — annoying, but safe. The reverse order could leave a live token
  // behind after a theft.
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(eq(refreshTokens.id, existing.id));

  return issueSession(row, ctx);
}

export async function logout(rawToken: string | undefined): Promise<void> {
  if (!rawToken) return;

  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(eq(refreshTokens.tokenHash, hashRefreshToken(rawToken)), isNull(refreshTokens.revokedAt)),
    );
}

export async function getById(userId: string): Promise<PublicUser> {
  const row = await findById(userId);
  if (!row) throw unauthorized('Your account no longer exists');
  return toPublicUser(row);
}

/** The ordinary change-password flow, for a student who already has a real one. */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  currentRefreshToken?: string,
): Promise<void> {
  const row = await findById(userId);
  if (!row) throw unauthorized('Your account no longer exists');

  if (row.mustChangePassword) {
    // Route them to the right door rather than letting them supply their USN as
    // the "current password" here and bypass the first-login flow's USN check.
    throw passwordChangeRequired();
  }

  if (!(await verifyPassword(currentPassword, row.passwordHash))) {
    throw unauthorized('Your current password is incorrect');
  }

  if (row.usn && normalizeUsn(newPassword) === normalizeUsn(row.usn)) {
    throw forbidden('Your password cannot be your USN.');
  }

  const passwordHash = await hashPassword(newPassword);

  await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, userId));

  const keepHash = currentRefreshToken ? hashRefreshToken(currentRefreshToken) : null;

  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(refreshTokens.userId, userId),
        isNull(refreshTokens.revokedAt),
        keepHash ? ne(refreshTokens.tokenHash, keepHash) : undefined,
      ),
    );
}

export async function listSessions(userId: string) {
  return db
    .select({
      id: refreshTokens.id,
      userAgent: refreshTokens.userAgent,
      ip: refreshTokens.ip,
      createdAt: refreshTokens.createdAt,
      expiresAt: refreshTokens.expiresAt,
    })
    .from(refreshTokens)
    .where(
      and(
        eq(refreshTokens.userId, userId),
        isNull(refreshTokens.revokedAt),
        gt(refreshTokens.expiresAt, new Date()),
      ),
    )
    .orderBy(refreshTokens.createdAt);
}

export async function revokeAllSessions(userId: string): Promise<void> {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
}

/** Housekeeping. Without it, `refresh_tokens` grows without bound. */
export async function pruneExpiredTokens(): Promise<number> {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const deleted = await db
    .delete(refreshTokens)
    .where(or(lt(refreshTokens.expiresAt, new Date()), lt(refreshTokens.revokedAt, cutoff)))
    .returning({ id: refreshTokens.id });

  return deleted.length;
}

