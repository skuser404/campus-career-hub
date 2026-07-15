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
 * Salary is modelled as a range plus an optional free-text override, rather than
 * a single string. The range is what makes "sort by salary" and "filter salary
 * >= X" possible; the free-text field exists because a great many campus postings
 * genuinely say "as per company norms", and forcing a number there would mean
 * inventing data.
 */
const salaryFields = {
  salaryMin: z.coerce.number().int().min(0).max(100_000_000).nullish(),
  salaryMax: z.coerce.number().int().min(0).max(100_000_000).nullish(),
  salaryCurrency: z.string().length(3).default('INR'),
  salaryText: z.string().trim().max(100).nullish(),
};

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

export const jobInputSchema = z
  .object({
    companyId: uuidSchema,
    categoryId: uuidSchema,
    role: z.string().trim().min(1, 'Role is required').max(LIMITS.ROLE_TITLE_MAX),
    description: z.string().trim().min(1, 'Description is required').max(LIMITS.DESCRIPTION_MAX),
    eligibility: z.string().trim().max(LIMITS.ELIGIBILITY_MAX).nullish(),
    ...salaryFields,
    ...eligibilityFields,
    location: z.string().trim().max(LIMITS.LOCATION_MAX).nullish(),
    mode: z.enum(JOB_MODES).default('onsite'),
    deadline: optionalDateSchema,
    applicationLink: httpUrlSchema,
    imageUrl: optionalHttpUrlSchema,
    status: z.enum(JOB_STATUSES).default('draft'),
    isFeatured: z.boolean().default(false),
    tagIds: z.array(uuidSchema).max(LIMITS.TAGS_PER_JOB_MAX).default([]),
  })
  .refine((d) => d.salaryMin == null || d.salaryMax == null || d.salaryMax >= d.salaryMin, {
    message: 'Maximum salary must be greater than or equal to minimum',
    path: ['salaryMax'],
  });
export type JobInput = z.infer<typeof jobInputSchema>;

/** `.partial()` cannot be called on a refined schema, so the update variant is rebuilt. */
export const updateJobSchema = z
  .object({
    companyId: uuidSchema,
    categoryId: uuidSchema,
    role: z.string().trim().min(1).max(LIMITS.ROLE_TITLE_MAX),
    description: z.string().trim().min(1).max(LIMITS.DESCRIPTION_MAX),
    eligibility: z.string().trim().max(LIMITS.ELIGIBILITY_MAX).nullish(),
    ...salaryFields,
    ...eligibilityFields,
    location: z.string().trim().max(LIMITS.LOCATION_MAX).nullish(),
    mode: z.enum(JOB_MODES),
    deadline: optionalDateSchema,
    applicationLink: httpUrlSchema,
    imageUrl: optionalHttpUrlSchema,
    status: z.enum(JOB_STATUSES),
    isFeatured: z.boolean(),
    tagIds: z.array(uuidSchema).max(LIMITS.TAGS_PER_JOB_MAX),
  })
  .partial()
  .refine((d) => d.salaryMin == null || d.salaryMax == null || d.salaryMax >= d.salaryMin, {
    message: 'Maximum salary must be greater than or equal to minimum',
    path: ['salaryMax'],
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
  location: z.string().nullable(),
  mode: z.enum(JOB_MODES),
  deadline: z.coerce.date().nullable(),
  applicationLink: z.string(),
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
