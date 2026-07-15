import { z } from 'zod';
import { LIMITS, PAGINATION } from '../constants';

/**
 * Reusable primitives. Defined once so that "what is a valid URL" has exactly
 * one answer across every form and every endpoint.
 */

export const uuidSchema = z.string().uuid('Must be a valid identifier');

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Email is required')
  .max(LIMITS.EMAIL_MAX, `Email must be at most ${LIMITS.EMAIL_MAX} characters`)
  .email('Enter a valid email address');

/**
 * Passwords must survive a credential-stuffing attempt, so we require mixed
 * character classes rather than only a length floor.
 */
export const passwordSchema = z
  .string()
  .min(LIMITS.PASSWORD_MIN, `Password must be at least ${LIMITS.PASSWORD_MIN} characters`)
  .max(LIMITS.PASSWORD_MAX, `Password must be at most ${LIMITS.PASSWORD_MAX} characters`)
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/[0-9]/, 'Password must contain a number');

export const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Must be lowercase letters, numbers and hyphens');

/** Only http(s). Blocks `javascript:` and `data:` URLs, which are an XSS vector. */
export const httpUrlSchema = z
  .string()
  .trim()
  .max(LIMITS.URL_MAX)
  .url('Enter a valid URL')
  .refine((v) => /^https?:\/\//i.test(v), 'URL must start with http:// or https://');

/** An optional URL where the form submits an empty string for "not provided". */
export const optionalHttpUrlSchema = z
  .union([httpUrlSchema, z.literal('')])
  .optional()
  .transform((v) => (v === '' || v === undefined ? null : v));

/** Accepts an ISO string (from JSON) or a Date, always yields a Date. */
export const dateSchema = z.union([z.string().datetime({ offset: true }), z.date()]).pipe(z.coerce.date());

export const optionalDateSchema = z
  .union([z.string().datetime({ offset: true }), z.date(), z.literal(''), z.null()])
  .optional()
  .transform((v) => (v === '' || v === null || v === undefined ? null : new Date(v)));

/** Query params arrive as strings, so page/limit are coerced then bounded. */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(PAGINATION.DEFAULT_PAGE),
  limit: z.coerce.number().int().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: { pagination?: PaginationMeta };
}

export interface ApiFailure {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Array<{ path: string; message: string }>;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

/**
 * A query param that may appear once (`?tags=react`) or many times
 * (`?tags=react&tags=node`). Express gives us a string in the first case and
 * an array in the second; this normalises both to an array.
 */
export const stringArrayQuerySchema = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((v) => {
    if (v === undefined) return undefined;
    const list = Array.isArray(v) ? v : [v];
    const cleaned = list.map((s) => s.trim()).filter(Boolean);
    return cleaned.length > 0 ? cleaned : undefined;
  });
