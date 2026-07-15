import type { MarkReadInput, Notification, NotificationQuery, NotificationType } from '@cch/shared';
import { and, count, desc, eq, inArray, lt } from 'drizzle-orm';
import { db } from '../../db/client';
import { notifications } from '../../db/schema';
import { buildPaginationMeta, offset } from '../../lib/utils';
import { logger } from '../../lib/logger';
import { findEligibleStudentIds } from '../jobs/jobs.service';

/**
 * Notifications are fanned out on WRITE: one row per eligible student.
 *
 * The alternative — a single broadcast row plus an "is this mine?" rule evaluated
 * at read time — would mean re-running the department eligibility check on every
 * dashboard load, and would leak the existence of a restricted opportunity to an
 * ineligible student the moment that rule had a bug.
 *
 * Fanning out costs ~1,400 rows for a university-wide posting. That is nothing
 * for Postgres, and it reduces "can I see this notification?" from a policy
 * decision to a primary-key lookup.
 */

/** Insert in chunks. A single 1,400-row VALUES list is fine; 50,000 would not be. */
const CHUNK = 500;

async function fanOut(
  userIds: string[],
  payload: { type: NotificationType; title: string; body?: string | null; link?: string | null },
): Promise<number> {
  if (userIds.length === 0) return 0;

  for (let i = 0; i < userIds.length; i += CHUNK) {
    const slice = userIds.slice(i, i + CHUNK);

    await db.insert(notifications).values(
      slice.map((userId) => ({
        userId,
        type: payload.type,
        title: payload.title,
        body: payload.body ?? null,
        link: payload.link ?? null,
      })),
    );
  }

  return userIds.length;
}

/**
 * Announce a newly published opportunity.
 *
 * The recipient list comes from `findEligibleStudentIds`, which is the mirror of
 * the eligibility filter used by the job queries. That symmetry is the point: a
 * student is notified about exactly the set of opportunities they can actually
 * open. Notifying more widely would send someone to a page that 404s them, and
 * would reveal that a restricted opportunity exists.
 *
 * Never throws. A notification failure must not roll back the publish — the
 * opportunity going live matters more than the announcement of it.
 */
export async function notifyNewOpportunity(
  jobId: string,
  role: string,
  companyName: string,
  slug: string,
): Promise<void> {
  try {
    const recipients = await findEligibleStudentIds(jobId);

    const sent = await fanOut(recipients, {
      type: 'new_opportunity',
      title: `${role} at ${companyName}`,
      body: 'A new opportunity you are eligible for has been posted.',
      // An in-app path, never an external URL — an attacker-controlled link here
      // would turn every notification into a phishing vector.
      link: `/opportunities/${slug}`,
    });

    logger.info({ jobId, recipients: sent }, 'Notified eligible students of a new opportunity');
  } catch (err) {
    logger.error({ err, jobId }, 'Failed to fan out new-opportunity notifications');
  }
}

/** Announce to a specific set of students (used by the announcements module). */
export async function notifyAnnouncement(
  userIds: string[],
  title: string,
  body: string,
): Promise<void> {
  try {
    await fanOut(userIds, { type: 'announcement', title, body, link: '/dashboard' });
  } catch (err) {
    logger.error({ err }, 'Failed to fan out announcement notifications');
  }
}

/** A one-off notification to a single student — e.g. "an admin reset your password". */
export async function notifyUser(
  userId: string,
  type: NotificationType,
  title: string,
  body?: string,
  link?: string,
): Promise<void> {
  try {
    await fanOut([userId], { type, title, body: body ?? null, link: link ?? null });
  } catch (err) {
    logger.error({ err, userId }, 'Failed to create notification');
  }
}

// ── Reads ────────────────────────────────────────────────────────────────

export async function list(userId: string, query: NotificationQuery) {
  // Scoped to the caller by a WHERE clause, not an `if`. Another student's id
  // matches no row.
  const filters = [eq(notifications.userId, userId)];

  if (query.unreadOnly) filters.push(eq(notifications.isRead, false));
  if (query.type) filters.push(eq(notifications.type, query.type));

  const where = and(...filters);

  const [countResult, rows] = await Promise.all([
    db.select({ value: count() }).from(notifications).where(where),
    db
      .select()
      .from(notifications)
      .where(where)
      .orderBy(desc(notifications.createdAt))
      .limit(query.limit)
      .offset(offset(query.page, query.limit)),
  ]);

  const items: Notification[] = rows.map((r) => ({
    id: r.id,
    type: r.type,
    title: r.title,
    body: r.body,
    link: r.link,
    isRead: r.isRead,
    createdAt: r.createdAt,
  }));

  return {
    items,
    pagination: buildPaginationMeta(query.page, query.limit, countResult[0]?.value ?? 0),
  };
}

/** The unread badge. Hits the partial index, so it stays cheap on every page load. */
export async function unreadCount(userId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));

  return row?.value ?? 0;
}

export async function markRead(userId: string, input: MarkReadInput): Promise<number> {
  const filters = [eq(notifications.userId, userId), eq(notifications.isRead, false)];

  // Omitting `ids` marks everything read. Passing ids that belong to someone else
  // is harmless: the userId filter means they match nothing.
  if (input.ids && input.ids.length > 0) {
    filters.push(inArray(notifications.id, input.ids));
  }

  const updated = await db
    .update(notifications)
    .set({ isRead: true })
    .where(and(...filters))
    .returning({ id: notifications.id });

  return updated.length;
}

export async function remove(userId: string, id: string): Promise<void> {
  await db
    .delete(notifications)
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
}

/**
 * Housekeeping.
 *
 * At 1,400 students, a single university-wide posting creates 1,400 rows. Without
 * pruning, a year of daily postings is half a million rows of noise nobody will
 * ever read. Read notifications older than 60 days are dropped.
 */
export async function pruneOld(): Promise<number> {
  const cutoff = new Date(Date.now() - 60 * 86_400_000);

  const deleted = await db
    .delete(notifications)
    .where(and(eq(notifications.isRead, true), lt(notifications.createdAt, cutoff)))
    .returning({ id: notifications.id });

  return deleted.length;
}
