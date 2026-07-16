import { analyticsQuerySchema, updateSiteSettingsSchema, uploadSignatureRequestSchema } from '@cch/shared';
import { Router } from 'express';
import { audit } from '../../lib/audit';
import { asyncHandler, ok } from '../../lib/http';
import { requireAdmin, requireAuth } from '../../middleware/auth';
import { mutationLimiter } from '../../middleware/security';
import { validateBody, validateQuery } from '../../middleware/validate';
import * as analytics from '../analytics/analytics.service';
import { adminAnnouncementRoutes, adminBannerRoutes } from '../content/content.routes';
import { adminJobRoutes } from '../jobs/jobs.routes';
import { adminReportRoutes } from '../reports/reports.routes';
import * as settings from '../settings/settings.service';
import { adminDepartmentRoutes, adminStudentRoutes } from '../students/students.routes';
import {
  adminCategoryRoutes,
  adminCompanyRoutes,
  adminTagRoutes,
} from '../taxonomy/taxonomy.routes';
import * as uploads from '../uploads/uploads.service';

export const adminRoutes: Router = Router();

/**
 * The admin boundary.
 *
 * Applied once here, and again inside each sub-router. The duplication is
 * deliberate: an authorisation check that only works because of where a router
 * happens to be mounted is one refactor away from being a vulnerability.
 */
adminRoutes.use(requireAuth, requireAdmin);

// ── Resources ────────────────────────────────────────────────────────────

adminRoutes.use('/jobs', adminJobRoutes);
adminRoutes.use('/students', adminStudentRoutes);
adminRoutes.use('/departments', adminDepartmentRoutes);
adminRoutes.use('/companies', adminCompanyRoutes);
adminRoutes.use('/categories', adminCategoryRoutes);
adminRoutes.use('/tags', adminTagRoutes);
adminRoutes.use('/announcements', adminAnnouncementRoutes);
adminRoutes.use('/banners', adminBannerRoutes);
adminRoutes.use('/reports', adminReportRoutes);

// ── Analytics ────────────────────────────────────────────────────────────

adminRoutes.get(
  '/analytics/overview',
  validateQuery(analyticsQuerySchema),
  asyncHandler(async (req, res) => {
    const { days } = req.query as unknown as { days: number };
    return ok(res, await analytics.getOverview(days));
  }),
);

adminRoutes.get(
  '/dashboard',
  asyncHandler(async (_req, res) => ok(res, await analytics.getDashboard())),
);

// ── Settings ─────────────────────────────────────────────────────────────

adminRoutes.get(
  '/settings',
  asyncHandler(async (_req, res) => ok(res, await settings.get())),
);

adminRoutes.patch(
  '/settings',
  mutationLimiter,
  validateBody(updateSiteSettingsSchema),
  asyncHandler(async (req, res) => {
    const row = await settings.update(req.body, req.user!.sub);
    await audit(req, 'settings_change', 'settings', 'site', { fields: Object.keys(req.body) });
    return ok(res, row);
  }),
);

// ── Uploads ──────────────────────────────────────────────────────────────

adminRoutes.post(
  '/uploads/signature',
  mutationLimiter,
  validateBody(uploadSignatureRequestSchema),
  asyncHandler(async (req, res) => ok(res, uploads.createSignature(req.body.folder))),
);
