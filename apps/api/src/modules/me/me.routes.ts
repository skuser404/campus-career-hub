import {
  applicationQuerySchema,
  createApplicationSchema,
  savedJobQuerySchema,
  setDepartmentSchema,
  updateApplicationSchema,
  updateOwnProfileSchema,
} from '@cch/shared';
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, created, noContent, ok } from '../../lib/http';
import { viewerOf } from '../../lib/viewer';
import { requireAuth } from '../../middleware/auth';
import { mutationLimiter } from '../../middleware/security';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate';
import * as authService from '../auth/auth.service';
import { meReportRoutes } from '../reports/reports.routes';
import * as uploads from '../uploads/uploads.service';
import * as service from './me.service';

const jobIdParams = z.object({ jobId: z.string().uuid() });
const idParams = z.object({ id: z.string().uuid() });

export const meRoutes: Router = Router();

/**
 * Everything below requires a signed-in user whose password is already set —
 * `requireAuth` rejects an account still holding its USN default.
 *
 * Every handler derives its scope from `req.user`. No route here accepts a user
 * id, a department, or a year from the client, which is what makes horizontal
 * privilege escalation impossible rather than merely unlikely.
 */
meRoutes.use(requireAuth);

// Report a missing opportunity → POST /me/reports
meRoutes.use('/reports', meReportRoutes);

// ── Profile ──────────────────────────────────────────────────────────────

meRoutes.get(
  '/profile',
  asyncHandler(async (req, res) => ok(res, await authService.getById(req.user!.sub))),
);

meRoutes.patch(
  '/profile',
  mutationLimiter,
  validateBody(updateOwnProfileSchema),
  asyncHandler(async (req, res) => ok(res, await service.updateProfile(req.user!.sub, req.body))),
);

/**
 * Set your own department — once. Deliberately its own endpoint rather than a
 * field on the profile update: `updateOwnProfileSchema` must keep refusing
 * `departmentId`, so a student cannot slip it in via the ordinary profile PATCH
 * and change branches later.
 */
meRoutes.post(
  '/department',
  mutationLimiter,
  validateBody(setDepartmentSchema),
  asyncHandler(async (req, res) =>
    ok(res, await service.setOwnDepartment(req.user!.sub, req.body.departmentId)),
  ),
);

/** Avatar upload. The folder is hardcoded — a student cannot obtain a signature
 *  that lets them write into the company-logo or banner folders. */
meRoutes.post(
  '/uploads/signature',
  mutationLimiter,
  asyncHandler(async (_req, res) => ok(res, uploads.createSignature('avatars'))),
);

// ── Dashboard ────────────────────────────────────────────────────────────

meRoutes.get(
  '/stats',
  asyncHandler(async (req, res) => ok(res, await service.getStats(req.user!.sub))),
);

meRoutes.get(
  '/deadlines',
  asyncHandler(async (req, res) =>
    ok(res, await service.getUpcomingDeadlines(viewerOf(req)!)),
  ),
);

meRoutes.get(
  '/timeline',
  asyncHandler(async (req, res) => ok(res, await service.getTimeline(req.user!.sub))),
);

// ── Saved ────────────────────────────────────────────────────────────────

meRoutes.get(
  '/saved',
  validateQuery(savedJobQuerySchema),
  asyncHandler(async (req, res) => {
    const result = await service.listSaved(viewerOf(req)!, req.query as never);
    return ok(res, result.items, result.pagination);
  }),
);

meRoutes.post(
  '/saved/:jobId',
  mutationLimiter,
  validateParams(jobIdParams),
  asyncHandler(async (req, res) => {
    await service.save(viewerOf(req)!, req.params.jobId as string);
    return created(res, { saved: true });
  }),
);

meRoutes.delete(
  '/saved/:jobId',
  mutationLimiter,
  validateParams(jobIdParams),
  asyncHandler(async (req, res) => {
    await service.unsave(req.user!.sub, req.params.jobId as string);
    return noContent(res);
  }),
);

// ── Applications ─────────────────────────────────────────────────────────

meRoutes.get(
  '/applications',
  validateQuery(applicationQuerySchema),
  asyncHandler(async (req, res) => {
    const result = await service.listApplications(viewerOf(req)!, req.query as never);
    return ok(res, result.items, result.pagination);
  }),
);

meRoutes.post(
  '/applications',
  mutationLimiter,
  validateBody(createApplicationSchema),
  asyncHandler(async (req, res) => created(res, await service.apply(viewerOf(req)!, req.body))),
);

meRoutes.patch(
  '/applications/:id',
  mutationLimiter,
  validateParams(idParams),
  validateBody(updateApplicationSchema),
  asyncHandler(async (req, res) =>
    ok(res, await service.updateApplication(viewerOf(req)!, req.params.id as string, req.body)),
  ),
);

meRoutes.delete(
  '/applications/:id',
  mutationLimiter,
  validateParams(idParams),
  asyncHandler(async (req, res) => {
    await service.deleteApplication(req.user!.sub, req.params.id as string);
    return noContent(res);
  }),
);
