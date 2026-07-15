import { z } from 'zod';
import { COLLEGE_EMAIL_DOMAIN, LIMITS, USER_ROLES } from '../constants';
import { emailSchema, passwordSchema, uuidSchema } from './common';

/**
 * There is NO registration schema, and that absence is the security model.
 *
 * A student account can only come into existence through an admin import. Any
 * self-service signup path would let an outsider with a plausible-looking email
 * create an account and read department-gated opportunities, which is precisely
 * what this system exists to prevent.
 */

/** Only a college address may sign in. Enforced here, again in the service, and again by a DB CHECK. */
export const collegeEmailSchema = emailSchema.refine(
  (v) => v.endsWith(`@${COLLEGE_EMAIL_DOMAIN}`),
  { message: `Use your college email (@${COLLEGE_EMAIL_DOMAIN})` },
);

export const loginSchema = z.object({
  email: collegeEmailSchema,
  // Deliberately NOT `passwordSchema`. The first-ever login uses the USN as the
  // password, which does not satisfy the complexity rules — validating it here
  // would make it impossible to sign in at all. Complexity is enforced when the
  // password is SET, which is the only place it means anything.
  password: z.string().min(1, 'Password is required'),
});
export type LoginInput = z.infer<typeof loginSchema>;

/**
 * Google Sign-In.
 *
 * The `credential` is the ID token Google's button hands back to the browser —
 * a signed JWT the API verifies against Google's public keys. The API never
 * trusts anything in it until that signature, the audience (our Client ID) and
 * the issuer all check out, so a forged token buys nothing.
 *
 * Google proving WHO someone is does not make them a student here: the verified
 * email must still end in the college domain AND already exist in the imported
 * roll. Google replaces the password; it does not replace the guest list.
 */
export const googleAuthSchema = z.object({
  credential: z.string().min(1, 'Missing Google credential'),
});
export type GoogleAuthInput = z.infer<typeof googleAuthSchema>;

/**
 * The forced first-login password change.
 *
 * Separate from `changePasswordSchema` because there is no "current password"
 * worth confirming — the current password is the USN, which is printed on the
 * student's ID card and therefore not a secret at all.
 */
export const firstLoginPasswordSchema = z
  .object({
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });
export type FirstLoginPasswordInput = z.infer<typeof firstLoginPasswordSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })
  .refine((d) => d.currentPassword !== d.newPassword, {
    message: 'New password must be different from your current password',
    path: ['newPassword'],
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/** The department, as embedded in a user or an opportunity. */
export const departmentRefSchema = z.object({
  id: uuidSchema,
  code: z.string(),
  name: z.string(),
});
export type DepartmentRef = z.infer<typeof departmentRefSchema>;

/**
 * The shape of a user as returned by the API. `passwordHash` is never in it.
 *
 * `department` and `year` are not decoration — they are the keys the server uses
 * to decide which opportunities this student is allowed to see.
 */
export const publicUserSchema = z.object({
  id: uuidSchema,
  email: z.string(),
  fullName: z.string(),
  usn: z.string().nullable(),
  role: z.enum(USER_ROLES),
  department: departmentRefSchema.nullable(),
  year: z.number().nullable(),
  section: z.string().nullable(),
  batch: z.string().nullable(),
  phone: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  isActive: z.boolean(),

  /** True until the student replaces the USN default. The client redirects on it. */
  mustChangePassword: z.boolean(),

  lastLoginAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
});
export type PublicUser = z.infer<typeof publicUserSchema>;

export const authResponseSchema = z.object({
  user: publicUserSchema,
  accessTokenExpiresAt: z.coerce.date(),
  /** Hoisted to the top level so the client can branch without digging into `user`. */
  mustChangePassword: z.boolean(),
});
export type AuthResponse = z.infer<typeof authResponseSchema>;

/**
 * Claims in the access JWT. Nothing sensitive, nothing large.
 *
 * Note what is NOT here: department. Department drives an authorisation
 * decision, and a claim baked into a 15-minute token would go stale the moment
 * an admin corrected a mis-imported student's branch. It is read from the row on
 * every request instead.
 */
export interface JwtPayload {
  sub: string;
  email: string;
  role: (typeof USER_ROLES)[number];
}

/** Profile fields a student may edit about themselves. */
export const updateOwnProfileSchema = z.object({
  phone: z
    .string()
    .trim()
    .regex(/^[+]?[\d\s()-]{7,20}$/, 'Enter a valid phone number')
    .nullish()
    .or(z.literal('')),
  avatarUrl: z
    .union([z.string().url(), z.literal('')])
    .optional()
    .transform((v) => (v === '' || v === undefined ? null : v)),
});
export type UpdateOwnProfileInput = z.infer<typeof updateOwnProfileSchema>;

/**
 * Note what a student CANNOT edit: name, USN, department, year, section, batch.
 *
 * Those are institutional facts owned by the registrar's import, and they decide
 * which opportunities the student can see. Letting a student change their own
 * department would be a one-click privilege escalation into another branch's
 * postings — so they are absent from the schema entirely, not merely disabled
 * in the UI.
 */
export const LIMITS_REF = LIMITS;
