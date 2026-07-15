import {
  adminJobQuerySchema,
  bulkJobActionSchema,
  jobInputSchema,
  jobQuerySchema,
  updateJobSchema,
} from '@cch/shared';
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/http';
import { requireAdmin, requireAuth } from '../../middleware/auth';
import { mutationLimiter } from '../../middleware/security';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate';
import * as controller from './jobs.controller';

const idParams = z.object({ id: z.string().uuid() });
const slugParams = z.object({ slug: z.string().min(1).max(200) });

// ─────────────────────────────────────────────────────────────────────────
// Student routes
//
// `requireAuth`, NOT `optionalAuth`. This is a closed system: opportunities are
// department-gated, so there is no coherent "anonymous" view of them — an
// anonymous caller has no department, and showing them only the university-wide
// postings would still be publishing internal placement data to the open web.
//
// Being signed in is therefore a precondition for seeing ANY opportunity.
// ─────────────────────────────────────────────────────────────────────────

export const jobRoutes: Router = Router();

jobRoutes.use(requireAuth);

jobRoutes.get('/', validateQuery(jobQuerySchema), asyncHandler(controller.listHandler));

jobRoutes.get('/featured', asyncHandler(controller.featuredHandler));

jobRoutes.post(
  '/:id/view',
  validateParams(idParams),
  asyncHandler(controller.viewHandler),
);

// Registered last: a bare `/:slug` would otherwise swallow `/featured`.
jobRoutes.get('/:slug', validateParams(slugParams), asyncHandler(controller.detailHandler));

// ─────────────────────────────────────────────────────────────────────────
// Admin routes
//
// The guards are repeated here even though this router is mounted under /admin,
// which already applies them. An authorisation check that only works because of
// where a router happens to be mounted is one refactor away from being a
// vulnerability.
// ─────────────────────────────────────────────────────────────────────────

export const adminJobRoutes: Router = Router();

adminJobRoutes.use(requireAuth, requireAdmin);

adminJobRoutes.get(
  '/',
  validateQuery(adminJobQuerySchema),
  asyncHandler(controller.adminListHandler),
);

adminJobRoutes.post(
  '/',
  mutationLimiter,
  validateBody(jobInputSchema),
  asyncHandler(controller.createHandler),
);

adminJobRoutes.post(
  '/bulk',
  mutationLimiter,
  validateBody(bulkJobActionSchema),
  asyncHandler(controller.bulkHandler),
);

adminJobRoutes.get('/:id', validateParams(idParams), asyncHandler(controller.adminDetailHandler));

adminJobRoutes.patch(
  '/:id',
  mutationLimiter,
  validateParams(idParams),
  validateBody(updateJobSchema),
  asyncHandler(controller.updateHandler),
);

adminJobRoutes.delete(
  '/:id',
  mutationLimiter,
  validateParams(idParams),
  asyncHandler(controller.deleteHandler),
);
