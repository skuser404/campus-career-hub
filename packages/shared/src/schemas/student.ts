import { z } from 'zod';
import {
  ACADEMIC_YEARS,
  COLLEGE_EMAIL_DOMAIN,
  LIMITS,
  USER_ROLES,
  USN_PATTERN,
} from '../constants';
import { paginationQuerySchema, slugSchema, uuidSchema } from './common';

// ─────────────────────────────────────────────────────────────────────────
// Departments
// ─────────────────────────────────────────────────────────────────────────

export const departmentInputSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(2, 'Code must be at least 2 characters')
    .max(10)
    .regex(/^[A-Z0-9]+$/, 'Code must be letters and numbers only'),
  name: z.string().trim().min(2).max(150),
  slug: slugSchema.optional(),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
});
export type DepartmentInput = z.infer<typeof departmentInputSchema>;

export const updateDepartmentSchema = departmentInputSchema.partial();
export type UpdateDepartmentInput = z.infer<typeof updateDepartmentSchema>;

export const departmentSchema = z.object({
  id: uuidSchema,
  code: z.string(),
  name: z.string(),
  slug: z.string(),
  sortOrder: z.number(),
  studentCount: z.number().optional(),
  jobCount: z.number().optional(),
});
export type Department = z.infer<typeof departmentSchema>;

// ─────────────────────────────────────────────────────────────────────────
// Students
// ─────────────────────────────────────────────────────────────────────────

export const usnSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(4, 'USN looks too short')
  .max(LIMITS.USN_MAX)
  .regex(USN_PATTERN, 'That does not look like a valid USN (e.g. 22BTRCS001)');

const collegeEmail = z
  .string()
  .trim()
  .toLowerCase()
  .email('Enter a valid email address')
  .max(LIMITS.EMAIL_MAX)
  .refine((v) => v.endsWith(`@${COLLEGE_EMAIL_DOMAIN}`), {
    message: `Email must be a college address (@${COLLEGE_EMAIL_DOMAIN})`,
  });

/**
 * One student, as an admin creates or edits them.
 *
 * There is no `password` field. The password is DERIVED from the USN by the
 * server on creation — an admin never chooses it, never sees it, and cannot set
 * it to something of their own choosing.
 */
export const studentInputSchema = z.object({
  fullName: z.string().trim().min(LIMITS.NAME_MIN).max(LIMITS.NAME_MAX),
  usn: usnSchema,
  email: collegeEmail,
  departmentId: uuidSchema,
  year: z.coerce
    .number()
    .int()
    .refine((v) => (ACADEMIC_YEARS as readonly number[]).includes(v), {
      message: 'Year must be 1, 2, 3 or 4',
    }),
  section: z.string().trim().max(LIMITS.SECTION_MAX).optional().or(z.literal('')),
  batch: z.string().trim().max(LIMITS.BATCH_MAX).optional().or(z.literal('')),
});
export type StudentInput = z.infer<typeof studentInputSchema>;

export const updateStudentSchema = studentInputSchema.partial();
export type UpdateStudentInput = z.infer<typeof updateStudentSchema>;

export const studentListQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().max(LIMITS.SEARCH_QUERY_MAX).optional(),
  departmentId: uuidSchema.optional(),
  year: z.coerce.number().int().min(1).max(4).optional(),
  section: z.string().trim().max(LIMITS.SECTION_MAX).optional(),
  batch: z.string().trim().max(LIMITS.BATCH_MAX).optional(),
  role: z.enum(USER_ROLES).optional(),
  isActive: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  /** Students who have never replaced their USN default — a live security risk list. */
  pendingPasswordChange: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  sort: z.enum(['newest', 'oldest', 'name', 'usn']).default('newest'),
});
export type StudentListQuery = z.infer<typeof studentListQuerySchema>;

// ─────────────────────────────────────────────────────────────────────────
// Bulk import
// ─────────────────────────────────────────────────────────────────────────

/**
 * One row of an uploaded CSV/XLSX, after header normalisation.
 *
 * The department arrives as a CODE ("CSE"), not a uuid — a registrar exporting
 * from the university system has no idea what our primary keys are. Resolving
 * the code to an id is the server's job.
 */
export const importRowSchema = z.object({
  fullName: z.string().trim().min(LIMITS.NAME_MIN).max(LIMITS.NAME_MAX),
  usn: usnSchema,
  email: collegeEmail,
  department: z.string().trim().toUpperCase().min(2).max(10),
  year: z.coerce
    .number()
    .int()
    .refine((v) => (ACADEMIC_YEARS as readonly number[]).includes(v), {
      message: 'Year must be 1, 2, 3 or 4',
    }),
  section: z.string().trim().max(LIMITS.SECTION_MAX).optional().or(z.literal('')),
  batch: z.string().trim().max(LIMITS.BATCH_MAX).optional().or(z.literal('')),
});
export type ImportRow = z.infer<typeof importRowSchema>;

export const importOptionsSchema = z.object({
  /**
   * When false, an existing USN is reported as a skip rather than updated.
   *
   * Defaults to TRUE because re-importing a corrected spreadsheet is the normal
   * case, and the alternative — silently creating duplicate students — is the
   * one outcome nobody wants.
   */
  updateExisting: z.coerce.boolean().default(true),

  /**
   * Dry run: parse, validate, and report exactly what WOULD happen, writing
   * nothing. An admin about to touch 1,400 accounts should be able to look
   * before they leap.
   */
  dryRun: z.coerce.boolean().default(false),
});
export type ImportOptions = z.infer<typeof importOptionsSchema>;

export interface ImportRowError {
  /** 1-based, and counting the header — so it matches what the admin sees in Excel. */
  row: number;
  usn?: string;
  email?: string;
  errors: string[];
}

export interface ImportResult {
  dryRun: boolean;
  totalRows: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  /** Capped, so one malformed file cannot return a 40MB error payload. */
  errors: ImportRowError[];
  /** Departments referenced in the file that do not exist. The most common real failure. */
  unknownDepartments: string[];
}

/** The exact headers the parser accepts, and their aliases. Documented for the admin UI. */
export const IMPORT_COLUMNS = {
  fullName: ['name', 'full name', 'fullname', 'student name'],
  usn: ['usn', 'university seat number', 'reg no', 'register number'],
  email: ['email', 'college email', 'mail', 'email id'],
  department: ['department', 'dept', 'branch', 'department code'],
  year: ['year', 'current year', 'study year'],
  section: ['section', 'sec'],
  batch: ['batch', 'admission batch', 'graduation batch'],
} as const;

export const IMPORT_TEMPLATE_HEADERS = [
  'Name',
  'USN',
  'Email',
  'Department',
  'Year',
  'Section',
  'Batch',
] as const;

// ─────────────────────────────────────────────────────────────────────────
// Admin actions on a student
// ─────────────────────────────────────────────────────────────────────────

export const updateUserRoleSchema = z.object({ role: z.enum(USER_ROLES) });
export type UpdateUserRoleInput = z.infer<typeof updateUserRoleSchema>;

export const updateUserStatusSchema = z.object({ isActive: z.boolean() });
export type UpdateUserStatusInput = z.infer<typeof updateUserStatusSchema>;

/** Resetting a password sets it back to the USN and re-arms the forced change. */
export interface ResetPasswordResult {
  message: string;
  usn: string;
}

/** Dashboard counters. */
export interface StudentStats {
  savedCount: number;
  appliedCount: number;
  closingSoonCount: number;
  offersCount: number;
  unreadNotifications: number;
}
