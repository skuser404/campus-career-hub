import path from 'node:path';
import { COLLEGE_EMAIL_DOMAIN } from '@cch/shared';
import dotenv from 'dotenv';
import { z } from 'zod';

// Load the repo-root .env, then any app-local .env (which wins).
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env'), override: true });

/**
 * Environment contract.
 *
 * The process REFUSES TO START if any of this is missing or malformed. A server
 * that boots with a placeholder JWT secret and only fails at the first login is
 * far more dangerous than one that never boots at all.
 */
const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
    JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
    JWT_ACCESS_TTL: z.string().default('15m'),
    JWT_REFRESH_TTL: z.string().default('7d'),
    BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),

    COOKIE_DOMAIN: z.string().optional(),

    CORS_ORIGINS: z
      .string()
      .default('http://localhost:3000')
      .transform((v) =>
        v
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      ),

    CLOUDINARY_CLOUD_NAME: z.string().optional(),
    CLOUDINARY_API_KEY: z.string().optional(),
    CLOUDINARY_API_SECRET: z.string().optional(),
    CLOUDINARY_UPLOAD_FOLDER: z.string().default('campus-career-hub'),

    // Google Sign-In. The Client ID is not a secret (it ships in the browser
    // anyway), but the API needs it to verify that an ID token was actually
    // minted for THIS application. Optional: without it, the Google button is
    // hidden and password login carries on unchanged.
    GOOGLE_CLIENT_ID: z.string().optional(),

    /**
     * Emails that become ADMIN on Google sign-in — the bootstrap for a
     * Google-only system where everyone else auto-creates as a student.
     *
     * Comma-separated, lower-cased. An email here is promoted to admin the next
     * time it signs in (whether the account is new or already exists), so adding
     * a placement officer's college Google address here and having them sign in
     * is all it takes to grant admin. Everyone not listed is a student.
     */
    ADMIN_EMAILS: z
      .string()
      .default('')
      .transform((v) =>
        v
          .split(',')
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean),
      ),

    /**
     * The admin must ALSO hold a college email.
     *
     * `loginSchema` enforces the @jainuniversity.ac.in domain for every sign-in,
     * with no exemption by role — which is the strict, and correct, reading of
     * "only college email addresses are allowed". An admin on an external domain
     * would be precisely the kind of backdoor this rule exists to prevent, and
     * an account that cannot pass the login check is a dead account anyway.
     */
    SEED_ADMIN_EMAIL: z
      .string()
      .email()
      .default('admin@jainuniversity.ac.in')
      .refine((v) => v.toLowerCase().endsWith(`@${COLLEGE_EMAIL_DOMAIN}`), {
        message: `SEED_ADMIN_EMAIL must be a college address (@${COLLEGE_EMAIL_DOMAIN}) — otherwise the admin can never sign in`,
      }),
    SEED_ADMIN_PASSWORD: z.string().min(8).default('ChangeMe!2024'),
    SEED_ADMIN_NAME: z.string().default('Placement Office'),
  })
  .superRefine((env, ctx) => {
    // Reusing one secret for both token types means a stolen access token can
    // be replayed as a refresh token. Refuse to run that way.
    if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_REFRESH_SECRET'],
        message: 'JWT_REFRESH_SECRET must differ from JWT_ACCESS_SECRET',
      });
    }

    if (env.NODE_ENV === 'production') {
      if (env.JWT_ACCESS_SECRET.includes('replace-me')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['JWT_ACCESS_SECRET'],
          message: 'Refusing to start in production with the example JWT secret',
        });
      }
      if (env.SEED_ADMIN_PASSWORD === 'ChangeMe!2024') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['SEED_ADMIN_PASSWORD'],
          message: 'Refusing to start in production with the default admin password',
        });
      }
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  • ${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('\n');

  // Written straight to stderr: the logger itself depends on this config, so it
  // does not exist yet at this point in the boot sequence.
  process.stderr.write(
    `\n✗ Invalid environment configuration:\n\n${issues}\n\n` +
      `  Copy .env.example to .env and fill in the missing values.\n\n`,
  );
  process.exit(1);
}

export const env = parsed.data;

export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
export const isDevelopment = env.NODE_ENV === 'development';

/** Cloudinary is optional: without it, image upload endpoints return 503 and the
 *  admin UI falls back to pasting an image URL. Everything else still works. */
export const isCloudinaryConfigured = Boolean(
  env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET,
);

/** Without a Client ID the Google endpoint returns 503 and the button is hidden. */
export const isGoogleConfigured = Boolean(env.GOOGLE_CLIENT_ID);
