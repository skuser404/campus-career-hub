import { z } from 'zod';
import { REPORT_STATUSES } from '../constants';
import { paginationQuerySchema, uuidSchema } from './common';

/**
 * "Report a missing opportunity."
 *
 * A student pastes a placement message their department received that is not on
 * the site yet. The admin reviews it and, if genuine, publishes an opportunity
 * from it. The message text is the whole point — everything else is optional
 * context.
 */
export const reportInputSchema = z.object({
  departmentId: uuidSchema.nullish(),
  companyName: z.string().trim().max(200).nullish().or(z.literal('')),
  message: z
    .string()
    .trim()
    .min(10, 'Paste the placement message so the admin can act on it')
    .max(10_000),
});
export type ReportInput = z.infer<typeof reportInputSchema>;

export const reportSchema = z.object({
  id: uuidSchema,
  companyName: z.string().nullable(),
  message: z.string(),
  status: z.enum(REPORT_STATUSES),
  createdAt: z.coerce.date(),
  reviewedAt: z.coerce.date().nullable(),
  reporter: z
    .object({ id: uuidSchema, fullName: z.string(), email: z.string() })
    .nullable(),
  department: z.object({ id: uuidSchema, code: z.string(), name: z.string() }).nullable(),
});
export type Report = z.infer<typeof reportSchema>;

export const reportListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(REPORT_STATUSES).optional(),
});
export type ReportListQuery = z.infer<typeof reportListQuerySchema>;

/** Admin decision on a report. `published` means an opportunity was created from it. */
export const reviewReportSchema = z.object({
  status: z.enum(['published', 'dismissed']),
});
export type ReviewReportInput = z.infer<typeof reviewReportSchema>;
