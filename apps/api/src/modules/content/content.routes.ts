import {
  announcementInputSchema,
  bannerInputSchema,
  contentListQuerySchema,
  reorderBannersSchema,
  updateAnnouncementSchema,
  updateBannerSchema,
} from '@cch/shared';
import { Router } from 'express';
import { z } from 'zod';
import { audit } from '../../lib/audit';
import { asyncHandler, created, noContent, ok } from '../../lib/http';
import { requireAdmin, requireAuth } from '../../middleware/auth';
import { mutationLimiter } from '../../middleware/security';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate';
import * as service from './content.service';

const idParams = z.object({ id: z.string().uuid() });

// ── Signed-in reads ──────────────────────────────────────────────────────
// Announcements are internal notices to enrolled students, not marketing copy.

export const publicAnnouncementRoutes: Router = Router();
publicAnnouncementRoutes.use(requireAuth);
publicAnnouncementRoutes.get(
  '/active',
  asyncHandler(async (_req, res) => ok(res, await service.listActiveAnnouncements())),
);

export const publicBannerRoutes: Router = Router();
publicBannerRoutes.use(requireAuth);
publicBannerRoutes.get(
  '/active',
  asyncHandler(async (_req, res) => ok(res, await service.listActiveBanners())),
);

// ── Admin: announcements ─────────────────────────────────────────────────

export const adminAnnouncementRoutes: Router = Router();
adminAnnouncementRoutes.use(requireAuth, requireAdmin);

adminAnnouncementRoutes.get(
  '/',
  validateQuery(contentListQuerySchema),
  asyncHandler(async (req, res) => {
    const result = await service.listAnnouncements(req.query as never);
    return ok(res, result.items, result.pagination);
  }),
);

adminAnnouncementRoutes.post(
  '/',
  mutationLimiter,
  validateBody(announcementInputSchema),
  asyncHandler(async (req, res) => {
    const row = await service.createAnnouncement(req.body, req.user!.sub);
    await audit(req, 'create', 'announcement', row?.id, { title: row?.title });
    return created(res, row);
  }),
);

adminAnnouncementRoutes.patch(
  '/:id',
  mutationLimiter,
  validateParams(idParams),
  validateBody(updateAnnouncementSchema),
  asyncHandler(async (req, res) => {
    const row = await service.updateAnnouncement(req.params.id as string, req.body);
    await audit(req, 'update', 'announcement', row.id, { fields: Object.keys(req.body) });
    return ok(res, row);
  }),
);

adminAnnouncementRoutes.delete(
  '/:id',
  mutationLimiter,
  validateParams(idParams),
  asyncHandler(async (req, res) => {
    await service.deleteAnnouncement(req.params.id as string);
    await audit(req, 'delete', 'announcement', req.params.id);
    return noContent(res);
  }),
);

// ── Admin: banners ───────────────────────────────────────────────────────

export const adminBannerRoutes: Router = Router();
adminBannerRoutes.use(requireAuth, requireAdmin);

adminBannerRoutes.get(
  '/',
  validateQuery(contentListQuerySchema),
  asyncHandler(async (req, res) => {
    const result = await service.listBanners(req.query as never);
    return ok(res, result.items, result.pagination);
  }),
);

adminBannerRoutes.post(
  '/',
  mutationLimiter,
  validateBody(bannerInputSchema),
  asyncHandler(async (req, res) => {
    const row = await service.createBanner(req.body);
    await audit(req, 'create', 'banner', row?.id, { title: row?.title });
    return created(res, row);
  }),
);

// Before `/:id`, or the router would read "reorder" as a uuid and 400.
adminBannerRoutes.post(
  '/reorder',
  mutationLimiter,
  validateBody(reorderBannersSchema),
  asyncHandler(async (req, res) => {
    await service.reorderBanners(req.body.ids);
    await audit(req, 'bulk_update', 'banner', null, { action: 'reorder' });
    return ok(res, { reordered: true });
  }),
);

adminBannerRoutes.patch(
  '/:id',
  mutationLimiter,
  validateParams(idParams),
  validateBody(updateBannerSchema),
  asyncHandler(async (req, res) => {
    const row = await service.updateBanner(req.params.id as string, req.body);
    await audit(req, 'update', 'banner', row.id, { fields: Object.keys(req.body) });
    return ok(res, row);
  }),
);

adminBannerRoutes.delete(
  '/:id',
  mutationLimiter,
  validateParams(idParams),
  asyncHandler(async (req, res) => {
    await service.deleteBanner(req.params.id as string);
    await audit(req, 'delete', 'banner', req.params.id);
    return noContent(res);
  }),
);
