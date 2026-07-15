import { Router } from 'express';
import { asyncHandler, ok } from './lib/http';
import { adminRoutes } from './modules/admin/admin.routes';
import { authRoutes } from './modules/auth/auth.routes';
import { publicAnnouncementRoutes, publicBannerRoutes } from './modules/content/content.routes';
import { jobRoutes } from './modules/jobs/jobs.routes';
import { meRoutes } from './modules/me/me.routes';
import { notificationRoutes } from './modules/notifications/notifications.routes';
import * as settings from './modules/settings/settings.service';
import { departmentRoutes } from './modules/students/students.routes';
import {
  publicCategoryRoutes,
  publicCompanyRoutes,
  publicTagRoutes,
} from './modules/taxonomy/taxonomy.routes';

/**
 * The API surface, mounted at /api/v1.
 *
 * This is a CLOSED system. Almost nothing is public, and that is deliberate:
 * opportunities are department-gated, so an anonymous caller has no department
 * and therefore no coherent view of them. Serving even the university-wide
 * postings to the open internet would publish internal placement data.
 *
 * Three tiers:
 *
 *   PUBLIC   — /auth/login, /auth/refresh, /settings. Nothing else. Just enough
 *              to render a login page and get through the door.
 *   STUDENT  — requireAuth. Every read is scoped by the caller's own
 *              department and year, in SQL.
 *   ADMIN    — requireAuth + requireAdmin.
 *
 * Each sub-router re-applies its own guards, so none of them depends on being
 * mounted here in order to be safe.
 */
export const routes: Router = Router();

// ── Public — the smallest possible surface ───────────────────────────────

routes.use('/auth', authRoutes);

/** The site name and feature flags, needed to render the login page itself. */
routes.use(
  '/settings',
  Router().get('/', asyncHandler(async (_req, res) => ok(res, await settings.get()))),
);

// ── Authenticated students ───────────────────────────────────────────────

routes.use('/jobs', jobRoutes);
routes.use('/me', meRoutes);
routes.use('/notifications', notificationRoutes);
routes.use('/departments', departmentRoutes);
routes.use('/companies', publicCompanyRoutes);
routes.use('/categories', publicCategoryRoutes);
routes.use('/tags', publicTagRoutes);
routes.use('/announcements', publicAnnouncementRoutes);
routes.use('/banners', publicBannerRoutes);

// ── Admin ────────────────────────────────────────────────────────────────

routes.use('/admin', adminRoutes);
