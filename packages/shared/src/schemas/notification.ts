import { z } from 'zod';
import { NOTIFICATION_TYPES } from '../constants';
import { paginationQuerySchema, uuidSchema } from './common';

/**
 * Notifications.
 *
 * A notification is a ROW PER STUDENT, not a broadcast that the client filters.
 * The alternative — one notification row plus a "who can see it" rule evaluated
 * at read time — would mean re-running the department-eligibility check on every
 * page load, and would leak the existence of an opportunity to a student who is
 * not eligible for it the moment that logic had a bug.
 *
 * Fan-out on write costs ~1,400 rows for a university-wide posting. That is
 * nothing for Postgres, and it makes "is this mine?" a primary-key lookup rather
 * than a policy decision.
 */
export const notificationSchema = z.object({
  id: uuidSchema,
  type: z.enum(NOTIFICATION_TYPES),
  title: z.string(),
  body: z.string().nullable(),
  /** An in-app path such as `/opportunities/sde-1-at-google`. Never an external URL. */
  link: z.string().nullable(),
  isRead: z.boolean(),
  createdAt: z.coerce.date(),
});
export type Notification = z.infer<typeof notificationSchema>;

export const notificationQuerySchema = paginationQuerySchema.extend({
  unreadOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  type: z.enum(NOTIFICATION_TYPES).optional(),
});
export type NotificationQuery = z.infer<typeof notificationQuerySchema>;

export const markReadSchema = z.object({
  /** Omit to mark every notification read. */
  ids: z.array(uuidSchema).max(200).optional(),
});
export type MarkReadInput = z.infer<typeof markReadSchema>;

export interface UnreadCount {
  unread: number;
}
