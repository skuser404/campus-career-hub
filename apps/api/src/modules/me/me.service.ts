import {
  CLOSING_SOON_DAYS,
  type Application,
  type ApplicationQuery,
  type CreateApplicationInput,
  type Job,
  type PublicUser,
  type SavedJobQuery,
  type StudentStats,
  type UpdateApplicationInput,
  type UpdateOwnProfileInput,
} from '@cch/shared';
import { and, asc, count, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { applications, jobs, notifications, savedJobs, users } from '../../db/schema';
import { conflict, notFound } from '../../lib/errors';
import { buildPaginationMeta, offset } from '../../lib/utils';
import { findById, toPublicUser } from '../auth/auth.service';
import * as jobsService from '../jobs/jobs.service';
import type { Viewer } from '../jobs/jobs.service';

/**
 * The student's own data.
 *
 * EVERY query here carries `eq(table.userId, viewer.userId)`. Ownership is a
 * WHERE clause, not an `if` — so an id belonging to somebody else simply matches
 * no row and returns 404, rather than returning their data.
 *
 * And every job read goes through `jobsService`, which re-applies the
 * department/year eligibility filter. That matters more than it looks: a student
 * who saved an opportunity and then had their department corrected by an admin
 * must STOP seeing it. Trusting "they saved it, so they had access once" would
 * turn the saved list into a permanent bypass of the eligibility rules.
 */

// ── Profile ──────────────────────────────────────────────────────────────

export async function updateProfile(
  userId: string,
  input: UpdateOwnProfileInput,
): Promise<PublicUser> {
  const patch: Record<string, unknown> = { updatedAt: new Date() };

  // An explicit allowlist of exactly two fields. Note what a student CANNOT
  // change about themselves: name, USN, department, year, section, batch, role,
  // isActive. Department and year decide which opportunities they can see, so
  // self-editing them would be a one-click escalation into another branch's
  // postings. They are institutional facts, owned by the registrar's import.
  if (input.phone !== undefined) patch.phone = input.phone || null;
  if (input.avatarUrl !== undefined) patch.avatarUrl = input.avatarUrl;

  const updated = await db
    .update(users)
    .set(patch)
    .where(eq(users.id, userId))
    .returning({ id: users.id });

  if (updated.length === 0) throw notFound('Account');

  const row = await findById(userId);
  return toPublicUser(row!);
}

// ── Saved ────────────────────────────────────────────────────────────────

export async function listSaved(viewer: Viewer, query: SavedJobQuery) {
  const [countResult, savedRows] = await Promise.all([
    db.select({ value: count() }).from(savedJobs).where(eq(savedJobs.userId, viewer.userId)),

    db
      .select({ jobId: savedJobs.jobId })
      .from(savedJobs)
      .innerJoin(jobs, eq(savedJobs.jobId, jobs.id))
      .where(eq(savedJobs.userId, viewer.userId))
      .orderBy(
        query.sort === 'deadline'
          ? sql`${jobs.deadline} ASC NULLS LAST`
          : desc(savedJobs.createdAt),
      )
      .limit(query.limit)
      .offset(offset(query.page, query.limit)),
  ]);

  // One batched query, not one per row — and it re-checks eligibility.
  const items = await jobsService.getByIds(
    savedRows.map((r) => r.jobId),
    viewer,
  );

  return {
    items,
    pagination: buildPaginationMeta(query.page, query.limit, countResult[0]?.value ?? 0),
  };
}

export async function save(viewer: Viewer, jobId: string): Promise<void> {
  // Fetching it AS THIS VIEWER is the authorisation check. A student cannot save
  // an opportunity they are not eligible for — otherwise "save" would be a way to
  // confirm that a restricted posting exists.
  await jobsService.getById(jobId, viewer);

  // Idempotent. The composite primary key would reject a duplicate; rather than
  // surfacing a 409 for what is a harmless double-click, we absorb it.
  await db
    .insert(savedJobs)
    .values({ userId: viewer.userId, jobId })
    .onConflictDoNothing();
}

export async function unsave(userId: string, jobId: string): Promise<void> {
  await db
    .delete(savedJobs)
    .where(and(eq(savedJobs.userId, userId), eq(savedJobs.jobId, jobId)));
}

// ── Applications ─────────────────────────────────────────────────────────

export async function listApplications(viewer: Viewer, query: ApplicationQuery) {
  const filters = [eq(applications.userId, viewer.userId)];
  if (query.status) filters.push(eq(applications.status, query.status));

  const where = and(...filters);

  const orderBy =
    query.sort === 'oldest'
      ? asc(applications.appliedAt)
      : query.sort === 'deadline'
        ? sql`${jobs.deadline} ASC NULLS LAST`
        : desc(applications.appliedAt);

  const [countResult, rows] = await Promise.all([
    db.select({ value: count() }).from(applications).where(where),

    db
      .select({
        id: applications.id,
        status: applications.status,
        notes: applications.notes,
        appliedAt: applications.appliedAt,
        updatedAt: applications.updatedAt,
        jobId: applications.jobId,
      })
      .from(applications)
      .innerJoin(jobs, eq(applications.jobId, jobs.id))
      .where(where)
      .orderBy(orderBy)
      .limit(query.limit)
      .offset(offset(query.page, query.limit)),
  ]);

  const fetched = await jobsService.getByIds(
    rows.map((r) => r.jobId),
    viewer,
  );
  const jobsById = new Map(fetched.map((j) => [j.id, j]));

  const items: Application[] = rows
    .filter((r) => jobsById.has(r.jobId))
    .map((r) => ({
      id: r.id,
      status: r.status,
      notes: r.notes,
      appliedAt: r.appliedAt,
      updatedAt: r.updatedAt,
      job: jobsById.get(r.jobId) as Job,
    }));

  return {
    items,
    pagination: buildPaginationMeta(query.page, query.limit, countResult[0]?.value ?? 0),
  };
}

export async function apply(viewer: Viewer, input: CreateApplicationInput): Promise<Application> {
  // Eligibility check, again by fetching as this viewer. A student must not be
  // able to record an application against a posting they cannot see.
  const job = await jobsService.getById(input.jobId, viewer);

  // No pre-check for an existing application. The unique index on (user_id, job_id)
  // is the authority, so two simultaneous clicks cannot both insert.
  const [row] = await db
    .insert(applications)
    .values({
      userId: viewer.userId,
      jobId: input.jobId,
      status: input.status,
      notes: input.notes ?? null,
    })
    .returning();

  if (!row) throw conflict('Could not record that application');

  return {
    id: row.id,
    status: row.status,
    notes: row.notes,
    appliedAt: row.appliedAt,
    updatedAt: row.updatedAt,
    job,
  };
}

export async function updateApplication(
  viewer: Viewer,
  applicationId: string,
  input: UpdateApplicationInput,
): Promise<Application> {
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.status !== undefined) patch.status = input.status;
  if (input.notes !== undefined) patch.notes = input.notes ?? null;

  // The userId in the WHERE is what makes this safe. Someone else's application id
  // matches zero rows, so they get a 404 — not their record, and no signal that
  // it exists.
  const [row] = await db
    .update(applications)
    .set(patch)
    .where(and(eq(applications.id, applicationId), eq(applications.userId, viewer.userId)))
    .returning();

  if (!row) throw notFound('Application');

  return {
    id: row.id,
    status: row.status,
    notes: row.notes,
    appliedAt: row.appliedAt,
    updatedAt: row.updatedAt,
    job: await jobsService.getById(row.jobId, viewer),
  };
}

export async function deleteApplication(userId: string, applicationId: string): Promise<void> {
  const deleted = await db
    .delete(applications)
    .where(and(eq(applications.id, applicationId), eq(applications.userId, userId)))
    .returning({ id: applications.id });

  if (deleted.length === 0) throw notFound('Application');
}

// ── Dashboard ────────────────────────────────────────────────────────────

export async function getStats(userId: string): Promise<StudentStats> {
  const now = new Date();
  const horizon = new Date(Date.now() + CLOSING_SOON_DAYS * 86_400_000);

  const [saved, applied, offers, closingSoon, unread] = await Promise.all([
    db.select({ value: count() }).from(savedJobs).where(eq(savedJobs.userId, userId)),

    db.select({ value: count() }).from(applications).where(eq(applications.userId, userId)),

    db
      .select({ value: count() })
      .from(applications)
      .where(and(eq(applications.userId, userId), eq(applications.status, 'offered'))),

    // "Closing soon" counts only the SAVED opportunities the student has NOT yet
    // applied to. Something already applied for is not an outstanding deadline,
    // and counting it would make the number useless — which is the entire problem
    // this product exists to fix.
    db
      .select({ value: count() })
      .from(savedJobs)
      .innerJoin(jobs, eq(savedJobs.jobId, jobs.id))
      .where(
        and(
          eq(savedJobs.userId, userId),
          eq(jobs.status, 'published'),
          gte(jobs.deadline, now),
          lte(jobs.deadline, horizon),
          sql`NOT EXISTS (
            SELECT 1 FROM ${applications}
            WHERE ${applications.jobId} = ${jobs.id}
              AND ${applications.userId} = ${userId}
          )`,
        ),
      ),

    db
      .select({ value: count() })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false))),
  ]);

  return {
    savedCount: saved[0]?.value ?? 0,
    appliedCount: applied[0]?.value ?? 0,
    offersCount: offers[0]?.value ?? 0,
    closingSoonCount: closingSoon[0]?.value ?? 0,
    unreadNotifications: unread[0]?.value ?? 0,
  };
}

/** The deadline feed: saved, not yet applied, closing soonest. */
export async function getUpcomingDeadlines(viewer: Viewer, limit = 5): Promise<Job[]> {
  const rows = await db
    .select({ jobId: jobs.id })
    .from(savedJobs)
    .innerJoin(jobs, eq(savedJobs.jobId, jobs.id))
    .where(
      and(
        eq(savedJobs.userId, viewer.userId),
        eq(jobs.status, 'published'),
        gte(jobs.deadline, new Date()),
        sql`NOT EXISTS (
          SELECT 1 FROM ${applications}
          WHERE ${applications.jobId} = ${jobs.id}
            AND ${applications.userId} = ${viewer.userId}
        )`,
      ),
    )
    .orderBy(asc(jobs.deadline))
    .limit(limit);

  return jobsService.getByIds(
    rows.map((r) => r.jobId),
    viewer,
  );
}

/**
 * The activity timeline — saves and applications, interleaved chronologically.
 *
 * Built with a UNION in SQL rather than by fetching both lists and merging in
 * JavaScript. Merging client-side would mean over-fetching both tables in full
 * just to throw most of it away, and the LIMIT could not be pushed down.
 */
export interface TimelineEntry {
  kind: 'saved' | 'applied';
  at: string;
  jobId: string;
  jobRole: string;
  jobSlug: string;
  companyName: string;
  status: string | null;
}

/**
 * `db.execute<T>` constrains T to `Record<string, unknown>`, and a plain
 * interface does not satisfy that (no index signature). This row type carries
 * one, and the public `TimelineEntry` above stays clean for callers.
 */
type TimelineRow = TimelineEntry & Record<string, unknown>;

export async function getTimeline(userId: string, limit = 20): Promise<TimelineEntry[]> {
  const result = await db.execute<TimelineRow>(sql`
    (
      SELECT 'saved'::text        AS kind,
             s.created_at         AS at,
             j.id                 AS "jobId",
             j.role               AS "jobRole",
             j.slug               AS "jobSlug",
             c.name               AS "companyName",
             NULL::text           AS status
      FROM saved_jobs s
      JOIN jobs j      ON j.id = s.job_id
      JOIN companies c ON c.id = j.company_id
      WHERE s.user_id = ${userId}
    )
    UNION ALL
    (
      SELECT 'applied'::text      AS kind,
             a.applied_at         AS at,
             j.id                 AS "jobId",
             j.role               AS "jobRole",
             j.slug               AS "jobSlug",
             c.name               AS "companyName",
             a.status::text       AS status
      FROM applications a
      JOIN jobs j      ON j.id = a.job_id
      JOIN companies c ON c.id = j.company_id
      WHERE a.user_id = ${userId}
    )
    ORDER BY at DESC
    LIMIT ${limit}
  `);

  return result.rows;
}
