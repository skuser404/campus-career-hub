import { markReadSchema, notificationQuerySchema } from '@cch/shared';
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, noContent, ok } from '../../lib/http';
import { requireAuth } from '../../middleware/auth';
import { mutationLimiter } from '../../middleware/security';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate';
import * as service from './notifications.service';

const idParams = z.object({ id: z.string().uuid() });

export const notificationRoutes: Router = Router();

/**
 * Every handler passes `req.user.sub` into the service, and no route accepts a
 * user id from the client. That is what makes reading someone else's
 * notifications impossible here rather than merely unlikely.
 */
notificationRoutes.use(requireAuth);

notificationRoutes.get(
  '/',
  validateQuery(notificationQuerySchema),
  asyncHandler(async (req, res) => {
    const result = await service.list(req.user!.sub, req.query as never);
    return ok(res, result.items, result.pagination);
  }),
);

/** The badge. Polled often, so it hits the partial index and returns one integer. */
notificationRoutes.get(
  '/unread-count',
  asyncHandler(async (req, res) =>
    ok(res, { unread: await service.unreadCount(req.user!.sub) }),
  ),
);

notificationRoutes.post(
  '/read',
  mutationLimiter,
  validateBody(markReadSchema),
  asyncHandler(async (req, res) => {
    const marked = await service.markRead(req.user!.sub, req.body);
    return ok(res, { marked });
  }),
);

notificationRoutes.delete(
  '/:id',
  mutationLimiter,
  validateParams(idParams),
  asyncHandler(async (req, res) => {
    await service.remove(req.user!.sub, req.params.id as string);
    return noContent(res);
  }),
);
