import { z } from 'zod';
import { optionalHttpUrlSchema, paginationQuerySchema, slugSchema, uuidSchema } from './common';

/**
 * Companies, categories and tags — the three lookup tables that `jobs`
 * references. Grouped together because they share an identical CRUD shape.
 */

// ── Company ──────────────────────────────────────────────────────────────

export const companyInputSchema = z.object({
  name: z.string().trim().min(1, 'Company name is required').max(200),
  // Optional on input: the server derives it from `name` when omitted.
  slug: slugSchema.optional(),
  logoUrl: optionalHttpUrlSchema,
  website: optionalHttpUrlSchema,
  description: z.string().trim().max(2000).nullish(),
});
export type CompanyInput = z.infer<typeof companyInputSchema>;

export const updateCompanySchema = companyInputSchema.partial();
export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;

export const companySchema = z.object({
  id: uuidSchema,
  name: z.string(),
  slug: z.string(),
  logoUrl: z.string().nullable(),
  website: z.string().nullable(),
  description: z.string().nullable(),
  jobCount: z.number().optional(),
  createdAt: z.coerce.date(),
});
export type Company = z.infer<typeof companySchema>;

// ── Category ─────────────────────────────────────────────────────────────

export const categoryInputSchema = z.object({
  name: z.string().trim().min(1, 'Category name is required').max(100),
  slug: slugSchema.optional(),
  description: z.string().trim().max(500).nullish(),
  color: z
    .string()
    .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Must be a hex colour such as #2563eb')
    .nullish(),
  icon: z.string().trim().max(50).nullish(),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
});
export type CategoryInput = z.infer<typeof categoryInputSchema>;

export const updateCategorySchema = categoryInputSchema.partial();
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

export const categorySchema = z.object({
  id: uuidSchema,
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  color: z.string().nullable(),
  icon: z.string().nullable(),
  sortOrder: z.number(),
  jobCount: z.number().optional(),
});
export type Category = z.infer<typeof categorySchema>;

// ── Tag ──────────────────────────────────────────────────────────────────

export const tagInputSchema = z.object({
  name: z.string().trim().min(1, 'Tag name is required').max(50),
});
export type TagInput = z.infer<typeof tagInputSchema>;

export const tagSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  slug: z.string(),
  jobCount: z.number().optional(),
});
export type Tag = z.infer<typeof tagSchema>;

// ── Shared list query ────────────────────────────────────────────────────

export const taxonomyListQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().max(100).optional(),
});
export type TaxonomyListQuery = z.infer<typeof taxonomyListQuerySchema>;
