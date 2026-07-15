import { z } from 'zod';
import { optionalHttpUrlSchema } from './common';

/**
 * Website settings, stored as a single JSONB row per key.
 *
 * This schema is both the validator and the default: `siteSettingsSchema.parse({})`
 * yields a fully-populated settings object, so a fresh database with no settings
 * row still renders a working site.
 */
export const siteSettingsSchema = z.object({
  siteName: z.string().trim().min(1).max(100).default('Campus Career Hub'),
  tagline: z
    .string()
    .trim()
    .max(200)
    .default('Every opportunity, in one place. Never miss a deadline again.'),
  supportEmail: z.string().email().or(z.literal('')).default(''),
  logoUrl: optionalHttpUrlSchema,

  // Feature flags. Flipping one takes effect without a redeploy.
  allowRegistration: z.boolean().default(true),
  maintenanceMode: z.boolean().default(false),
  maintenanceMessage: z
    .string()
    .trim()
    .max(500)
    .default('We are performing scheduled maintenance. Please check back shortly.'),

  // Surfaces on the landing page and dashboard.
  showBanners: z.boolean().default(true),
  showAnnouncements: z.boolean().default(true),
  featuredCategorySlug: z.string().trim().max(100).default(''),

  socialLinks: z
    .object({
      linkedin: z.string().default(''),
      twitter: z.string().default(''),
      github: z.string().default(''),
    })
    .default({ linkedin: '', twitter: '', github: '' }),
});
export type SiteSettings = z.infer<typeof siteSettingsSchema>;

export const updateSiteSettingsSchema = siteSettingsSchema.partial();
export type UpdateSiteSettingsInput = z.infer<typeof updateSiteSettingsSchema>;

/** Defaults, materialised. Used by the API when the settings row is absent. */
export const DEFAULT_SITE_SETTINGS: SiteSettings = siteSettingsSchema.parse({});

/**
 * Cloudinary direct-upload signature request. The browser asks the API to sign
 * an upload; the API returns short-lived params. The API secret never leaves
 * the server and the image bytes never pass through it.
 */
export const uploadSignatureRequestSchema = z.object({
  folder: z.enum(['jobs', 'companies', 'banners', 'avatars']).default('jobs'),
});
export type UploadSignatureRequest = z.infer<typeof uploadSignatureRequestSchema>;

export const uploadSignatureResponseSchema = z.object({
  signature: z.string(),
  timestamp: z.number(),
  apiKey: z.string(),
  cloudName: z.string(),
  folder: z.string(),
  uploadUrl: z.string(),
});
export type UploadSignatureResponse = z.infer<typeof uploadSignatureResponseSchema>;
