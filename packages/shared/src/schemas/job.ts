import { z } from 'zod';
import {
  ACADEMIC_YEARS,
  JOB_MODES,
  JOB_SORT_OPTIONS,
  JOB_STATUSES,
  LIMITS,
} from '../constants';
import {
  httpUrlSchema,
  optionalDateSchema,
  optionalHttpUrlSchema,
  paginationQuerySchema,
  stringArrayQuerySchema,
  uuidSchema,
} from './common';
import { departmentRefSchema } from './auth';
import { categorySchema, companySchema, tagSchema } from './taxonomy';


/**
 * Eligibility.
 *
 * An EMPTY list means "open to everyone" — not "open to nobody". This is the
 * single most important semantic in the file, because it is the default an admin
 * gets when they forget to tick anything, and getting it backwards would silently
 * hide every new posting from the entire university.
 */
const eligibilityFields = {
  departmentIds: z.array(uuidSchema).max(50).default([]),
  years: z
    .array(
      z.coerce
        .number()
        .int()
        .refine((v) => (ACADEMIC_YEARS as readonly number[]).includes(v)),
    )
    .max(4)
    .default([]),
};

/**
 * Salary as a From–To range in LPA (lakhs per annum) — the unit every Indian
 * placement message uses — plus a separate internship stipend, which is a
 * different thing from an annual CTC and gets its own free-text field.
 */
const lpaSalaryFields = {
  salaryFromLpa: z.coerce.number().min(0).max(999).nullish(),
  salaryToLpa: z.coerce.number().min(0).max(999).nullish(),
  internshipStipend: z.string().trim().max(120).nullish(),
};

const lpaRangeValid = (d: { salaryFromLpa?: number | null; salaryToLpa?: number | null }) =>
  d.salaryFromLpa == null || d.salaryToLpa == null || d.salaryToLpa >= d.salaryFromLpa;

/**
 * The link fields. `applicationLink` (the official apply URL) is required; the
 * WhatsApp group and college-registration links are optional extras a placement
 * message often carries.
 */
const linkFields = {
  applicationLink: httpUrlSchema,
  whatsappGroupLink: optionalHttpUrlSchema,
  collegeRegLink: optionalHttpUrlSchema,
  companyLogoUrl: optionalHttpUrlSchema,
};

export const jobInputSchema = z
  .object({
    // Free text now — no company dropdown. The API finds an existing company of
    // this name or creates one, so the normalised company list stays intact while
    // the admin just types.
    companyName: z.string().trim().min(1, 'Company name is required').max(200),
    role: z.string().trim().min(1, 'Role is required').max(LIMITS.ROLE_TITLE_MAX),
    description: z.string().trim().min(1, 'JD is required').max(LIMITS.DESCRIPTION_MAX),
    eligibility: z.string().trim().max(LIMITS.ELIGIBILITY_MAX).nullish(),
    ...lpaSalaryFields,
    ...eligibilityFields,
    location: z.string().trim().max(LIMITS.LOCATION_MAX).nullish(),
    mode: z.enum(JOB_MODES).default('not_mentioned'),
    deadline: optionalDateSchema,
    ...linkFields,
    imageUrl: optionalHttpUrlSchema,
    status: z.enum(JOB_STATUSES).default('draft'),
    isFeatured: z.boolean().default(false),
    // Skills / technologies. Free-text names — the API finds-or-creates each tag,
    // so an admin can type "Kubernetes" without it having to exist first.
    skills: z.array(z.string().trim().min(1).max(50)).max(LIMITS.TAGS_PER_JOB_MAX).default([]),
  })
  .refine(lpaRangeValid, {
    message: 'Maximum salary must be greater than or equal to minimum',
    path: ['salaryToLpa'],
  });
export type JobInput = z.infer<typeof jobInputSchema>;

/** `.partial()` cannot be called on a refined schema, so the update variant is rebuilt. */
export const updateJobSchema = z
  .object({
    companyName: z.string().trim().min(1).max(200),
    role: z.string().trim().min(1).max(LIMITS.ROLE_TITLE_MAX),
    description: z.string().trim().min(1).max(LIMITS.DESCRIPTION_MAX),
    eligibility: z.string().trim().max(LIMITS.ELIGIBILITY_MAX).nullish(),
    ...lpaSalaryFields,
    ...eligibilityFields,
    location: z.string().trim().max(LIMITS.LOCATION_MAX).nullish(),
    mode: z.enum(JOB_MODES),
    deadline: optionalDateSchema,
    ...linkFields,
    imageUrl: optionalHttpUrlSchema,
    status: z.enum(JOB_STATUSES),
    isFeatured: z.boolean(),
    skills: z.array(z.string().trim().min(1).max(50)).max(LIMITS.TAGS_PER_JOB_MAX),
  })
  .partial()
  .refine(lpaRangeValid, {
    message: 'Maximum salary must be greater than or equal to minimum',
    path: ['salaryToLpa'],
  });
export type UpdateJobInput = z.infer<typeof updateJobSchema>;

/** A job as returned by the API, with its relations resolved. */
export const jobSchema = z.object({
  id: uuidSchema,
  slug: z.string(),
  role: z.string(),
  description: z.string(),
  eligibility: z.string().nullable(),
  salaryMin: z.number().nullable(),
  salaryMax: z.number().nullable(),
  salaryCurrency: z.string(),
  salaryText: z.string().nullable(),
  salaryFromLpa: z.coerce.number().nullable(),
  salaryToLpa: z.coerce.number().nullable(),
  internshipStipend: z.string().nullable(),
  location: z.string().nullable(),
  mode: z.enum(JOB_MODES),
  deadline: z.coerce.date().nullable(),
  applicationLink: z.string(),
  whatsappGroupLink: z.string().nullable(),
  collegeRegLink: z.string().nullable(),
  companyLogoUrl: z.string().nullable(),
  imageUrl: z.string().nullable(),
  status: z.enum(JOB_STATUSES),
  isFeatured: z.boolean(),
  viewsCount: z.number(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),

  company: companySchema.pick({ id: true, name: true, slug: true, logoUrl: true, website: true }),
  category: categorySchema.pick({ id: true, name: true, slug: true, color: true, icon: true }),
  tags: z.array(tagSchema.pick({ id: true, name: true, slug: true })),

  /** Empty array = open to every department. Same for `years`. */
  departments: z.array(departmentRefSchema),
  years: z.array(z.number()),

  // Present only when the request is authenticated. Lets the card render the
  // correct Save / Applied state without a second round trip per job.
  isSaved: z.boolean().optional(),
  isApplied: z.boolean().optional(),
  applicationsCount: z.number().optional(),
});
export type Job = z.infer<typeof jobSchema>;

/**
 * The search contract for `GET /jobs`.
 *
 * Note what is ABSENT: any way to ask for another department's opportunities.
 * Eligibility is not a query parameter — it is derived server-side from the
 * signed-in student's own row. A student cannot widen their own visibility by
 * editing a URL, because there is no URL to edit.
 */
export const jobQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().max(LIMITS.SEARCH_QUERY_MAX).optional(),
  category: z.string().trim().optional(),
  company: z.string().trim().optional(),
  mode: z.enum(JOB_MODES).optional(),
  tags: stringArrayQuerySchema,
  salaryMin: z.coerce.number().int().min(0).optional(),
  deadlineBefore: z.coerce.date().optional(),
  deadlineAfter: z.coerce.date().optional(),
  featured: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  closingSoon: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  sort: z.enum(JOB_SORT_OPTIONS).default('newest'),
});
export type JobQuery = z.infer<typeof jobQuerySchema>;

/**
 * The ADMIN search contract.
 *
 * Extends the student one with the things only an admin may ask: status, and
 * filtering by the department an opportunity targets. Kept as a separate schema
 * so that `status` is not merely ignored on the student route — it is not even
 * accepted there.
 */
export const adminJobQuerySchema = jobQuerySchema.extend({
  status: z.enum(JOB_STATUSES).optional(),
  departmentId: uuidSchema.optional(),
});
export type AdminJobQuery = z.infer<typeof adminJobQuerySchema>;

/** Admin bulk action on the jobs table. */
export const bulkJobActionSchema = z.object({
  ids: z.array(uuidSchema).min(1, 'Select at least one opportunity').max(100),
  action: z.enum(['publish', 'close', 'archive', 'feature', 'unfeature', 'delete']),
});
export type BulkJobActionInput = z.infer<typeof bulkJobActionSchema>;

/**
 * Paste a WhatsApp message; get structured fields back to review and edit.
 *
 * The server extracts what it confidently can (a link, a deadline, a salary
 * line…) and leaves the rest for the admin. It is a HEAD START, never a
 * finished job — which is why every field is optional and why the flow ends in
 * an editable preview, not an instant publish.
 */
export const parseJobSchema = z.object({
  text: z.string().trim().min(1, 'Paste the message first').max(LIMITS.DESCRIPTION_MAX),
});
export type ParseJobInput = z.infer<typeof parseJobSchema>;

export interface ParsedJob {
  companyName: string | null;
  role: string | null;
  description: string;
  eligibility: string | null;
  salaryFromLpa: number | null;
  salaryToLpa: number | null;
  internshipStipend: string | null;
  location: string | null;
  mode: (typeof JOB_MODES)[number] | null;
  /** ISO string when a date was confidently found, else null. */
  deadline: string | null;
  applicationLink: string | null;
  whatsappGroupLink: string | null;
  collegeRegLink: string | null;
  /** Free-text batch (e.g. "2026 & 2027") — informational, folded into eligibility. */
  batch: string | null;
  /** Skills / technologies / languages / frameworks detected in the message. */
  skills: string[];
  /** Which fields the parser actually filled — lets the UI highlight guesses. */
  detected: string[];
}
