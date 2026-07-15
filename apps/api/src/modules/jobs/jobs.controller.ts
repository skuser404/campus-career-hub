import type { AdminJobQuery, BulkJobActionInput, JobInput, JobQuery, UpdateJobInput } from '@cch/shared';
import type { Request, Response } from 'express';
import { audit } from '../../lib/audit';
import { created, noContent, ok } from '../../lib/http';
import { logger } from '../../lib/logger';
import { adminViewer, viewerOf } from '../../lib/viewer';
import * as notifications from '../notifications/notifications.service';
import * as service from './jobs.service';

// ── Student ──────────────────────────────────────────────────────────────

export async function listHandler(req: Request, res: Response) {
  const query = req.query as unknown as JobQuery;

  // `viewerOf` carries the student's department and year. Everything they are
  // not eligible for is excluded in SQL, before a single row is serialised.
  const result = await service.list(query, viewerOf(req));

  return ok(res, result.items, result.pagination);
}

export async function detailHandler(req: Request, res: Response) {
  const slug = req.params.slug as string;
  return ok(res, await service.getBySlug(slug, viewerOf(req)));
}

export async function featuredHandler(req: Request, res: Response) {
  return ok(res, await service.getFeatured(viewerOf(req)));
}

/**
 * Record a view.
 *
 * Eligibility is checked FIRST, by fetching the job as this viewer. Without that,
 * a student could confirm the existence of a restricted opportunity — and inflate
 * its view count — simply by POSTing its id.
 */
export async function viewHandler(req: Request, res: Response) {
  const id = req.params.id as string;

  await service.getById(id, viewerOf(req));

  // Fire-and-forget from here. An analytics counter must never be able to break
  // the page a student is trying to read.
  service.recordView(id, req.user?.sub).catch((err) => {
    logger.warn({ err, jobId: id }, 'Failed to record job view');
  });

  return noContent(res);
}

// ── Admin ────────────────────────────────────────────────────────────────

export async function adminListHandler(req: Request, res: Response) {
  const query = req.query as unknown as AdminJobQuery;
  const result = await service.list(query, adminViewer(req.user!.sub));
  return ok(res, result.items, result.pagination);
}

export async function adminDetailHandler(req: Request, res: Response) {
  const id = req.params.id as string;
  return ok(res, await service.getById(id, adminViewer(req.user!.sub)));
}

export async function createHandler(req: Request, res: Response) {
  const input = req.body as JobInput;

  const job = await service.create(input, req.user!.sub);

  await audit(req, 'create', 'job', job.id, {
    role: job.role,
    company: job.company.name,
    status: job.status,
    departments: job.departments.map((d) => d.code),
    years: job.years,
  });

  // Notify only when it goes live. Announcing a draft would tell students about
  // an opportunity they cannot open.
  if (job.status === 'published') {
    await notifications.notifyNewOpportunity(job.id, job.role, job.company.name, job.slug);
  }

  return created(res, job);
}

export async function updateHandler(req: Request, res: Response) {
  const id = req.params.id as string;
  const input = req.body as UpdateJobInput;

  const before = await service.getById(id, adminViewer(req.user!.sub));
  const job = await service.update(id, input, req.user!.sub);

  await audit(req, 'update', 'job', id, { fields: Object.keys(input) });

  // Draft → published is the moment the opportunity becomes real. Notify then,
  // and only then — an edit to an already-published job must not re-notify
  // fourteen hundred people.
  if (before.status !== 'published' && job.status === 'published') {
    await notifications.notifyNewOpportunity(job.id, job.role, job.company.name, job.slug);
  }

  return ok(res, job);
}

export async function deleteHandler(req: Request, res: Response) {
  const id = req.params.id as string;

  await service.remove(id);
  await audit(req, 'delete', 'job', id);

  return noContent(res);
}

export async function bulkHandler(req: Request, res: Response) {
  const { ids, action } = req.body as BulkJobActionInput;

  const affected = await service.bulkAction(ids, action);

  await audit(req, action === 'delete' ? 'bulk_delete' : 'bulk_update', 'job', null, {
    action,
    count: affected,
    ids,
  });

  return ok(res, { affected });
}
