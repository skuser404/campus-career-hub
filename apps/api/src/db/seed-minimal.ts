import { DEFAULT_CATEGORIES, DEFAULT_DEPARTMENTS } from '@cch/shared';
import { eq } from 'drizzle-orm';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import { hashPassword } from '../lib/password';
import { slugify } from '../lib/utils';
import { checkDatabaseConnection, closeDatabase, db } from './client';
import { categories, departments, users } from './schema';

/**
 * MINIMAL production seed.
 *
 * The bare skeleton a real deployment needs and nothing more: the six
 * departments, the six categories, and one admin account. No demo students, no
 * demo opportunities — those belong in `seed.ts` for local development, not in a
 * database that is about to serve real students.
 *
 * Idempotent, like the full seed: safe to run twice, and it never overwrites an
 * existing admin's password.
 *
 *   DATABASE_URL=<prod> SEED_ADMIN_PASSWORD=<strong> npm run db:seed:minimal -w @cch/api
 */
async function main() {
  logger.info('Minimal production seed…\n');

  if (!(await checkDatabaseConnection())) {
    logger.error('Cannot reach the database. Check DATABASE_URL.');
    process.exit(1);
  }

  // Departments — the access-control dimension the whole system turns on.
  for (const [i, d] of DEFAULT_DEPARTMENTS.entries()) {
    await db
      .insert(departments)
      .values({ code: d.code, name: d.name, slug: slugify(d.code), sortOrder: i })
      .onConflictDoNothing({ target: departments.slug });
  }
  logger.info(`✓ ${DEFAULT_DEPARTMENTS.length} departments`);

  // Categories — Placement, Internship, Hackathon, Certification, Workshop, Event.
  for (const [i, c] of DEFAULT_CATEGORIES.entries()) {
    await db
      .insert(categories)
      .values({ name: c.name, slug: c.slug, color: c.color, icon: c.icon, sortOrder: i })
      .onConflictDoNothing({ target: categories.slug });
  }
  logger.info(`✓ ${DEFAULT_CATEGORIES.length} categories`);

  // The admin. Password comes from the environment, never derived from a USN, so
  // `mustChangePassword` is false — there is no known default to force them off.
  const email = env.SEED_ADMIN_EMAIL.toLowerCase();
  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  if (existing) {
    logger.info(`✓ admin already exists (${email}) — password left untouched`);
  } else {
    await db.insert(users).values({
      email,
      passwordHash: await hashPassword(env.SEED_ADMIN_PASSWORD),
      fullName: env.SEED_ADMIN_NAME,
      role: 'admin',
      mustChangePassword: false,
    });
    logger.info(`✓ admin created (${email})`);
  }

  logger.info('\n✓ Minimal seed complete.\n');
  logger.info(`  Admin: ${env.SEED_ADMIN_EMAIL}`);
  logger.info('  Next: sign in, add companies, then Students → Import your roll.\n');
}

main()
  .catch((err) => {
    logger.error({ err }, '✗ Minimal seed failed');
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
