import { reportInputSchema, reportListQuerySchema, reviewReportSchema } from '@cch/shared';
import { Router } from 'express';
import { z } from 'zod';
import { audit } from '../../lib/audit';
import { asyncHandler, created, ok } from '../../lib/http';
import { requireAdmin, requireAuth } from '../../middleware/auth';
import { mutationLimiter } from '../../middleware/security';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate';
import * as notifications from '../notifications/notifications.service';
import * as service from './reports.service';

const idParams = z.object({ id: z.string().uuid() });

// ── Student: submit a report ─────────────────────────────────────────────
// Mounted on /me, which already requires a signed-in student.

export const meReportRoutes: Router = Router();

meReportRoutes.post(
  '/',
  mutationLimiter,
  validateBody(reportInputSchema),
  asyncHandler(async (req, res) => {
    const result = await service.create(req.user!.sub, req.body);
    await audit(req, 'create', 'opportunity_report', result.id, {
      company: req.body.companyName ?? undefined,
    });
    return created(res, result);
  }),
);

// ── Admin: review the queue ──────────────────────────────────────────────

export const adminReportRoutes: Router = Router();
adminReportRoutes.use(requireAuth, requireAdmin);

adminReportRoutes.get(
  '/',
  validateQuery(reportListQuerySchema),
  asyncHandler(async (req, res) => {
    const result = await service.list(req.query as never);
    return ok(res, result.items, result.pagination);
  }),
);

/** The raw message, for prefilling the new-opportunity paste box. */
adminReportRoutes.get(
  '/:id/message',
  validateParams(idParams),
  asyncHandler(async (req, res) =>
    ok(res, { message: await service.getMessage(req.params.id as string) }),
  ),
);

adminReportRoutes.patch(
  '/:id',
  mutationLimiter,
  validateParams(idParams),
  validateBody(reviewReportSchema),
  asyncHandler(async (req, res) => {
    const id = req.params.id as string;
    const row = await service.review(id, req.body, req.user!.sub);

    await audit(req, 'update', 'opportunity_report', id, { status: row.status });

    // Tell the student what happened to their report — the loop that makes
    // reporting feel worthwhile rather than like shouting into a void.
    if (row.reporterId) {
      await notifications.notifyUser(
        row.reporterId,
        'report_update',
        row.status === 'published'
          ? 'Your reported opportunity is now live'
          : 'Your report was reviewed',
        row.status === 'published'
          ? 'Thanks — the opportunity you sent has been published. Check the opportunities page.'
          : 'Thanks for the report. The placement office reviewed it and did not publish it this time.',
        row.status === 'published' ? '/opportunities' : undefined,
      );
    }

    return ok(res, { status: row.status });
  }),
);
