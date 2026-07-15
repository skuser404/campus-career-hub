import type {
  AnnouncementInput,
  BannerInput,
  ContentListQuery,
  UpdateAnnouncementInput,
  UpdateBannerInput,
} from '@cch/shared';
import { and, asc, count, desc, eq, gt, isNull, lte, or, sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { db } from '../../db/client';
import { announcements, banners } from '../../db/schema';
import { notFound } from '../../lib/errors';
import { buildPaginationMeta, offset } from '../../lib/utils';

/**
 * "Active right now" means three things at once: the flag is on, the start date
 * has passed (or there is none), and the end date has not (or there is none).
 *
 * Computing this in SQL rather than filtering in JavaScript is what lets an admin
 * schedule a banner for exam week and forget about it — nothing has to run at
 * midnight to switch it on or off.
 */
// `AnyPgColumn`, because Drizzle bakes the table name into a column's type —
// typing these to `announcements.startsAt` would make the helper unusable for
// `banners`, which needs exactly the same logic.
function activeWindow(startsAt: AnyPgColumn, endsAt: AnyPgColumn): SQL {
  const now = new Date();
  return and(
    or(isNull(startsAt), lte(startsAt, now)),
    or(isNull(endsAt), gt(endsAt, now)),
  ) as SQL;
}

// ── Announcements ────────────────────────────────────────────────────────

/** Ordered by urgency first, then recency — an urgent notice outranks a newer routine one. */
const priorityRank = sql`CASE ${announcements.priority}
  WHEN 'urgent' THEN 0
  WHEN 'high'   THEN 1
  WHEN 'normal' THEN 2
  WHEN 'low'    THEN 3
  ELSE 4 END`;

export async function listActiveAnnouncements() {
  return db
    .select()
    .from(announcements)
    .where(
      and(
        eq(announcements.isActive, true),
        activeWindow(announcements.startsAt, announcements.endsAt),
      ),
    )
    .orderBy(priorityRank, desc(announcements.createdAt))
    .limit(10);
}

export async function listAnnouncements(query: ContentListQuery) {
  const filters: SQL[] = [];
  if (query.isActive !== undefined) filters.push(eq(announcements.isActive, query.isActive));
  const where = filters.length > 0 ? and(...filters) : undefined;

  const [countResult, rows] = await Promise.all([
    db.select({ value: count() }).from(announcements).where(where),
    db
      .select()
      .from(announcements)
      .where(where)
      .orderBy(desc(announcements.createdAt))
      .limit(query.limit)
      .offset(offset(query.page, query.limit)),
  ]);

  return {
    items: rows,
    pagination: buildPaginationMeta(query.page, query.limit, countResult[0]?.value ?? 0),
  };
}

export async function createAnnouncement(input: AnnouncementInput, createdBy: string) {
  const [row] = await db
    .insert(announcements)
    .values({
      title: input.title,
      body: input.body,
      priority: input.priority,
      isActive: input.isActive,
      startsAt: input.startsAt ?? null,
      endsAt: input.endsAt ?? null,
      createdBy,
    })
    .returning();

  return row;
}

export async function updateAnnouncement(id: string, input: UpdateAnnouncementInput) {
  const patch: Record<string, unknown> = { updatedAt: new Date() };

  if (input.title !== undefined) patch.title = input.title;
  if (input.body !== undefined) patch.body = input.body;
  if (input.priority !== undefined) patch.priority = input.priority;
  if (input.isActive !== undefined) patch.isActive = input.isActive;
  if (input.startsAt !== undefined) patch.startsAt = input.startsAt;
  if (input.endsAt !== undefined) patch.endsAt = input.endsAt;

  const [row] = await db
    .update(announcements)
    .set(patch)
    .where(eq(announcements.id, id))
    .returning();

  if (!row) throw notFound('Announcement');
  return row;
}

export async function deleteAnnouncement(id: string) {
  const deleted = await db
    .delete(announcements)
    .where(eq(announcements.id, id))
    .returning({ id: announcements.id });

  if (deleted.length === 0) throw notFound('Announcement');
}

// ── Banners ──────────────────────────────────────────────────────────────

export async function listActiveBanners() {
  return db
    .select()
    .from(banners)
    .where(and(eq(banners.isActive, true), activeWindow(banners.startsAt, banners.endsAt)))
    .orderBy(asc(banners.sortOrder), desc(banners.createdAt))
    .limit(10);
}

export async function listBanners(query: ContentListQuery) {
  const filters: SQL[] = [];
  if (query.isActive !== undefined) filters.push(eq(banners.isActive, query.isActive));
  const where = filters.length > 0 ? and(...filters) : undefined;

  const [countResult, rows] = await Promise.all([
    db.select({ value: count() }).from(banners).where(where),
    db
      .select()
      .from(banners)
      .where(where)
      .orderBy(asc(banners.sortOrder), desc(banners.createdAt))
      .limit(query.limit)
      .offset(offset(query.page, query.limit)),
  ]);

  return {
    items: rows,
    pagination: buildPaginationMeta(query.page, query.limit, countResult[0]?.value ?? 0),
  };
}

export async function createBanner(input: BannerInput) {
  const [row] = await db
    .insert(banners)
    .values({
      title: input.title,
      imageUrl: input.imageUrl,
      linkUrl: input.linkUrl ?? null,
      sortOrder: input.sortOrder,
      isActive: input.isActive,
      startsAt: input.startsAt ?? null,
      endsAt: input.endsAt ?? null,
    })
    .returning();

  return row;
}

export async function updateBanner(id: string, input: UpdateBannerInput) {
  const patch: Record<string, unknown> = { updatedAt: new Date() };

  if (input.title !== undefined) patch.title = input.title;
  if (input.imageUrl !== undefined) patch.imageUrl = input.imageUrl;
  if (input.linkUrl !== undefined) patch.linkUrl = input.linkUrl;
  if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder;
  if (input.isActive !== undefined) patch.isActive = input.isActive;
  if (input.startsAt !== undefined) patch.startsAt = input.startsAt;
  if (input.endsAt !== undefined) patch.endsAt = input.endsAt;

  const [row] = await db.update(banners).set(patch).where(eq(banners.id, id)).returning();
  if (!row) throw notFound('Banner');

  return row;
}

export async function deleteBanner(id: string) {
  const deleted = await db.delete(banners).where(eq(banners.id, id)).returning({ id: banners.id });
  if (deleted.length === 0) throw notFound('Banner');
}

/**
 * Persist a drag-and-drop reorder.
 *
 * One transaction: a half-applied reorder would leave two banners claiming the
 * same slot, and the list would render in an arbitrary order.
 */
export async function reorderBanners(ids: string[]): Promise<void> {
  await db.transaction(async (tx) => {
    for (const [index, id] of ids.entries()) {
      await tx
        .update(banners)
        .set({ sortOrder: index, updatedAt: new Date() })
        .where(eq(banners.id, id));
    }
  });
}
