import {
  categoryInputSchema,
  companyInputSchema,
  tagInputSchema,
  taxonomyListQuerySchema,
  updateCategorySchema,
  updateCompanySchema,
} from '@cch/shared';
import { Router } from 'express';
import { z } from 'zod';
import { audit } from '../../lib/audit';
import { asyncHandler, created, noContent, ok } from '../../lib/http';
import { requireAdmin, requireAuth } from '../../middleware/auth';
import { mutationLimiter } from '../../middleware/security';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate';
import * as service from './taxonomy.service';

const idParams = z.object({ id: z.string().uuid() });

// ── Signed-in reads ──────────────────────────────────────────────────────
//
// `requireAuth`, not open. Categories, companies and tags drive the filter chips,
// and in a closed system even the SHAPE of the data is internal — a list of every
// company recruiting at the university is exactly the sort of thing that should
// not be scrapeable from the open web.

export const publicCompanyRoutes: Router = Router();
publicCompanyRoutes.use(requireAuth);
publicCompanyRoutes.get(
  '/',
  validateQuery(taxonomyListQuerySchema),
  asyncHandler(async (req, res) => {
    const result = await service.listCompanies(req.query as never);
    return ok(res, result.items, result.pagination);
  }),
);

export const publicCategoryRoutes: Router = Router();
publicCategoryRoutes.use(requireAuth);
publicCategoryRoutes.get(
  '/',
  asyncHandler(async (_req, res) => ok(res, await service.listCategories())),
);

export const publicTagRoutes: Router = Router();
publicTagRoutes.use(requireAuth);
publicTagRoutes.get(
  '/',
  validateQuery(taxonomyListQuerySchema.partial()),
  asyncHandler(async (req, res) => ok(res, await service.listTags(req.query as never))),
);

// ── Admin writes ─────────────────────────────────────────────────────────

export const adminCompanyRoutes: Router = Router();
adminCompanyRoutes.use(requireAuth, requireAdmin);

adminCompanyRoutes.get(
  '/',
  validateQuery(taxonomyListQuerySchema),
  asyncHandler(async (req, res) => {
    const result = await service.listCompanies(req.query as never);
    return ok(res, result.items, result.pagination);
  }),
);

adminCompanyRoutes.post(
  '/',
  mutationLimiter,
  validateBody(companyInputSchema),
  asyncHandler(async (req, res) => {
    const row = await service.createCompany(req.body);
    await audit(req, 'create', 'company', row?.id, { name: row?.name });
    return created(res, row);
  }),
);

adminCompanyRoutes.patch(
  '/:id',
  mutationLimiter,
  validateParams(idParams),
  validateBody(updateCompanySchema),
  asyncHandler(async (req, res) => {
    const row = await service.updateCompany(req.params.id as string, req.body);
    await audit(req, 'update', 'company', row.id, { fields: Object.keys(req.body) });
    return ok(res, row);
  }),
);

adminCompanyRoutes.delete(
  '/:id',
  mutationLimiter,
  validateParams(idParams),
  asyncHandler(async (req, res) => {
    await service.deleteCompany(req.params.id as string);
    await audit(req, 'delete', 'company', req.params.id);
    return noContent(res);
  }),
);

export const adminCategoryRoutes: Router = Router();
adminCategoryRoutes.use(requireAuth, requireAdmin);

adminCategoryRoutes.get(
  '/',
  asyncHandler(async (_req, res) => ok(res, await service.listCategories())),
);

adminCategoryRoutes.post(
  '/',
  mutationLimiter,
  validateBody(categoryInputSchema),
  asyncHandler(async (req, res) => {
    const row = await service.createCategory(req.body);
    await audit(req, 'create', 'category', row?.id, { name: row?.name });
    return created(res, row);
  }),
);

adminCategoryRoutes.patch(
  '/:id',
  mutationLimiter,
  validateParams(idParams),
  validateBody(updateCategorySchema),
  asyncHandler(async (req, res) => {
    const row = await service.updateCategory(req.params.id as string, req.body);
    await audit(req, 'update', 'category', row.id, { fields: Object.keys(req.body) });
    return ok(res, row);
  }),
);

adminCategoryRoutes.delete(
  '/:id',
  mutationLimiter,
  validateParams(idParams),
  asyncHandler(async (req, res) => {
    await service.deleteCategory(req.params.id as string);
    await audit(req, 'delete', 'category', req.params.id);
    return noContent(res);
  }),
);

export const adminTagRoutes: Router = Router();
adminTagRoutes.use(requireAuth, requireAdmin);

adminTagRoutes.get(
  '/',
  validateQuery(taxonomyListQuerySchema.partial()),
  asyncHandler(async (req, res) => ok(res, await service.listTags(req.query as never))),
);

adminTagRoutes.post(
  '/',
  mutationLimiter,
  validateBody(tagInputSchema),
  asyncHandler(async (req, res) => {
    const row = await service.createTag(req.body);
    await audit(req, 'create', 'tag', row?.id, { name: row?.name });
    return created(res, row);
  }),
);

adminTagRoutes.delete(
  '/:id',
  mutationLimiter,
  validateParams(idParams),
  asyncHandler(async (req, res) => {
    await service.deleteTag(req.params.id as string);
    await audit(req, 'delete', 'tag', req.params.id);
    return noContent(res);
  }),
);
