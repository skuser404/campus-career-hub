import { isCollegeEmail } from '@cch/shared';
import { eq } from 'drizzle-orm';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import { hashPassword } from '../lib/password';
import { checkDatabaseConnection, closeDatabase, db } from './client';
import { refreshTokens, users } from './schema';

/**
 * Reset (or create) the admin account's password.
 *
 * The password is taken from `SEED_ADMIN_PASSWORD` in the environment — it is
 * never generated here and never printed, so whoever runs this is the only party
 * who ever knows it. That is the whole point: an operator can restore admin
 * access without a credential passing through a log, a chat, or a screen share.
 *
 * Also the recovery path if the admin is ever locked out.
 *
 *   SEED_ADMIN_PASSWORD='your-strong-password' npm run db:reset-admin -w @cch/api
 *
 * On Render, run it from the service Shell with the env var already set.
 */
async function main() {
  const email = env.SEED_ADMIN_EMAIL.toLowerCase();

  // The domain lock applies to the admin too — an admin on a non-college address
  // could never sign in, because `loginSchema` rejects the domain for everyone.
  if (!isCollegeEmail(email)) {
    logger.error(`SEED_ADMIN_EMAIL (${email}) must be a college address. Refusing.`);
    process.exit(1);
  }

  if (!(await checkDatabaseConnection())) {
    logger.error('Cannot reach the database. Check DATABASE_URL.');
    process.exit(1);
  }

  const passwordHash = await hashPassword(env.SEED_ADMIN_PASSWORD);
  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  if (existing) {
    await db
      .update(users)
      .set({
        passwordHash,
        role: 'admin',
        // Promote back to a set-and-ready admin: active, and not forced through
        // the first-login change (an admin's password is chosen, not a USN).
        isActive: true,
        mustChangePassword: false,
        updatedAt: new Date(),
      })
      .where(eq(users.id, existing.id));

    // Revoke every existing session for that account — if the reset is because
    // of a suspected compromise, this ejects whoever was in.
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokens.userId, existing.id));

    logger.info(`✓ Admin password reset for ${email}. All existing sessions revoked.`);
  } else {
    await db.insert(users).values({
      email,
      passwordHash,
      fullName: env.SEED_ADMIN_NAME,
      role: 'admin',
      mustChangePassword: false,
    });

    logger.info(`✓ Admin account created for ${email}.`);
  }

  logger.info('  Sign in with the SEED_ADMIN_PASSWORD you provided, then change it from Settings.');
}

main()
  .catch((err) => {
    logger.error({ err }, '✗ Admin reset failed');
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
