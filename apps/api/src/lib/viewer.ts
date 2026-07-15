import type { Request } from 'express';
import type { Viewer } from '../modules/jobs/jobs.service';

/**
 * Turn a request into a `Viewer`.
 *
 * This exists so that no handler ever hand-assembles the object that drives the
 * eligibility check. Forgetting to pass `departmentId` would not fail to
 * compile — it would just silently widen what a student can see, which is the
 * quietest possible security regression. One function, used everywhere, means
 * there is exactly one place to get it right.
 */
export function viewerOf(req: Request): Viewer | null {
  if (!req.user) return null;

  return {
    userId: req.user.sub,
    role: req.user.role,
    departmentId: req.user.departmentId,
    year: req.user.year,
  };
}

/**
 * A viewer that sees everything. ONLY for admin-authenticated routes and for
 * internal read-backs (e.g. returning a draft to the admin who just created it).
 *
 * Never call this on a route a student can reach.
 */
export function adminViewer(userId: string): Viewer {
  return { userId, role: 'admin', departmentId: null, year: null };
}
