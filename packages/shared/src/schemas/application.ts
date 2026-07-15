import { z } from 'zod';
import { APPLICATION_STATUSES, LIMITS } from '../constants';
import { paginationQuerySchema, uuidSchema } from './common';
import { jobSchema } from './job';

/**
 * "Mark as Applied" is the feature that actually solves the stated problem:
 * a student cannot remember which of forty WhatsApp links they already acted
 * on. So an application is a tracked record with a lifecycle, not a boolean.
 */

export const createApplicationSchema = z.object({
  jobId: uuidSchema,
  status: z.enum(APPLICATION_STATUSES).default('applied'),
  notes: z.string().trim().max(LIMITS.NOTES_MAX).nullish(),
});
export type CreateApplicationInput = z.infer<typeof createApplicationSchema>;

export const updateApplicationSchema = z
  .object({
    status: z.enum(APPLICATION_STATUSES).optional(),
    notes: z.string().trim().max(LIMITS.NOTES_MAX).nullish(),
  })
  .refine((d) => d.status !== undefined || d.notes !== undefined, {
    message: 'Provide a status or a note to update',
  });
export type UpdateApplicationInput = z.infer<typeof updateApplicationSchema>;

export const applicationSchema = z.object({
  id: uuidSchema,
  status: z.enum(APPLICATION_STATUSES),
  notes: z.string().nullable(),
  appliedAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  job: jobSchema,
});
export type Application = z.infer<typeof applicationSchema>;

export const applicationQuerySchema = paginationQuerySchema.extend({
  status: z.enum(APPLICATION_STATUSES).optional(),
  sort: z.enum(['newest', 'oldest', 'deadline']).default('newest'),
});
export type ApplicationQuery = z.infer<typeof applicationQuerySchema>;

/** Saved jobs are a plain bookmark — no lifecycle, so no status column. */
export const savedJobQuerySchema = paginationQuerySchema.extend({
  sort: z.enum(['newest', 'deadline']).default('newest'),
});
export type SavedJobQuery = z.infer<typeof savedJobQuerySchema>;
