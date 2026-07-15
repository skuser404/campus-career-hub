import { z } from 'zod';
import { ANNOUNCEMENT_PRIORITIES } from '../constants';
import {
  httpUrlSchema,
  optionalDateSchema,
  optionalHttpUrlSchema,
  paginationQuerySchema,
  uuidSchema,
} from './common';

/**
 * Announcements and banners. Both are time-windowed: an admin schedules them
 * with `startsAt` / `endsAt` and the server decides what is "active" now, so
 * nobody has to remember to switch things off.
 */

// ── Announcement ─────────────────────────────────────────────────────────

const announcementFields = {
  title: z.string().trim().min(1, 'Title is required').max(200),
  body: z.string().trim().min(1, 'Message is required').max(5000),
  priority: z.enum(ANNOUNCEMENT_PRIORITIES).default('normal'),
  isActive: z.boolean().default(true),
  startsAt: optionalDateSchema,
  endsAt: optionalDateSchema,
};

const endsAfterStarts = (d: { startsAt?: Date | null; endsAt?: Date | null }) =>
  d.startsAt == null || d.endsAt == null || d.endsAt > d.startsAt;

export const announcementInputSchema = z
  .object(announcementFields)
  .refine(endsAfterStarts, { message: 'End date must be after the start date', path: ['endsAt'] });
export type AnnouncementInput = z.infer<typeof announcementInputSchema>;

export const updateAnnouncementSchema = z
  .object(announcementFields)
  .partial()
  .refine(endsAfterStarts, { message: 'End date must be after the start date', path: ['endsAt'] });
export type UpdateAnnouncementInput = z.infer<typeof updateAnnouncementSchema>;

export const announcementSchema = z.object({
  id: uuidSchema,
  title: z.string(),
  body: z.string(),
  priority: z.enum(ANNOUNCEMENT_PRIORITIES),
  isActive: z.boolean(),
  startsAt: z.coerce.date().nullable(),
  endsAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type Announcement = z.infer<typeof announcementSchema>;

// ── Banner ───────────────────────────────────────────────────────────────

const bannerFields = {
  title: z.string().trim().min(1, 'Title is required').max(200),
  imageUrl: httpUrlSchema,
  linkUrl: optionalHttpUrlSchema,
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
  isActive: z.boolean().default(true),
  startsAt: optionalDateSchema,
  endsAt: optionalDateSchema,
};

export const bannerInputSchema = z
  .object(bannerFields)
  .refine(endsAfterStarts, { message: 'End date must be after the start date', path: ['endsAt'] });
export type BannerInput = z.infer<typeof bannerInputSchema>;

export const updateBannerSchema = z
  .object(bannerFields)
  .partial()
  .refine(endsAfterStarts, { message: 'End date must be after the start date', path: ['endsAt'] });
export type UpdateBannerInput = z.infer<typeof updateBannerSchema>;

export const bannerSchema = z.object({
  id: uuidSchema,
  title: z.string(),
  imageUrl: z.string(),
  linkUrl: z.string().nullable(),
  sortOrder: z.number(),
  isActive: z.boolean(),
  startsAt: z.coerce.date().nullable(),
  endsAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
});
export type Banner = z.infer<typeof bannerSchema>;

export const reorderBannersSchema = z.object({
  ids: z.array(uuidSchema).min(1),
});
export type ReorderBannersInput = z.infer<typeof reorderBannersSchema>;

export const contentListQuerySchema = paginationQuerySchema.extend({
  isActive: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
});
export type ContentListQuery = z.infer<typeof contentListQuerySchema>;
