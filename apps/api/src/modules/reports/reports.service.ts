import type { Report, ReportInput, ReportListQuery, ReviewReportInput } from '@cch/shared';
import { and, count, desc, eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { departments, opportunityReports, users } from '../../db/schema';
import { notFound } from '../../lib/errors';
import { buildPaginationMeta, offset } from '../../lib/utils';

/**
 * Opportunity reports — the "something's missing" channel.
 *
 * A student submits a placement message; it lands in the admin's pending queue.
 * The admin reviews it and either publishes an opportunity from it (marking the
 * report `published`) or dismisses it. Nothing a student sends is ever shown to
 * other students directly — it is raw, unreviewed text, so it only becomes
 * visible through an admin-authored opportunity.
 */

export async function create(reporterId: string, input: ReportInput): Promise<{ id: string }> {
  const [row] = await db
    .insert(opportunityReports)
    .values({
      reporterId,
      departmentId: input.departmentId ?? null,
      companyName: input.companyName || null,
      message: input.message,
    })
    .returning({ id: opportunityReports.id });

  return { id: (row as { id: string }).id };
}

export async function list(query: ReportListQuery) {
  const where = query.status ? eq(opportunityReports.status, query.status) : undefined;

  const [countResult, rows] = await Promise.all([
    db.select({ value: count() }).from(opportunityReports).where(where),

    db
      .select({
        id: opportunityReports.id,
        companyName: opportunityReports.companyName,
        message: opportunityReports.message,
        status: opportunityReports.status,
        createdAt: opportunityReports.createdAt,
        reviewedAt: opportunityReports.reviewedAt,
        reporterId: users.id,
        reporterName: users.fullName,
        reporterEmail: users.email,
        departmentId: departments.id,
        departmentCode: departments.code,
        departmentName: departments.name,
      })
      .from(opportunityReports)
      .leftJoin(users, eq(opportunityReports.reporterId, users.id))
      .leftJoin(departments, eq(opportunityReports.departmentId, departments.id))
      .where(where)
      // Pending first (so the queue reads top-down), then newest.
      .orderBy(desc(opportunityReports.status), desc(opportunityReports.createdAt))
      .limit(query.limit)
      .offset(offset(query.page, query.limit)),
  ]);

  const items: Report[] = rows.map((r) => ({
    id: r.id,
    companyName: r.companyName,
    message: r.message,
    status: r.status,
    createdAt: r.createdAt,
    reviewedAt: r.reviewedAt,
    reporter: r.reporterId
      ? { id: r.reporterId, fullName: r.reporterName as string, email: r.reporterEmail as string }
      : null,
    department: r.departmentId
      ? { id: r.departmentId, code: r.departmentCode as string, name: r.departmentName as string }
      : null,
  }));

  return {
    items,
    pagination: buildPaginationMeta(query.page, query.limit, countResult[0]?.value ?? 0),
  };
}

export async function review(
  id: string,
  input: ReviewReportInput,
  reviewedBy: string,
): Promise<{ reporterId: string | null; status: string }> {
  const [row] = await db
    .update(opportunityReports)
    .set({ status: input.status, reviewedBy, reviewedAt: new Date(), updatedAt: new Date() })
    .where(eq(opportunityReports.id, id))
    .returning({
      reporterId: opportunityReports.reporterId,
      status: opportunityReports.status,
    });

  if (!row) throw notFound('Report');
  return row;
}

/** The single message body, e.g. to prefill the job form's paste box. */
export async function getMessage(id: string): Promise<string> {
  const [row] = await db
    .select({ message: opportunityReports.message })
    .from(opportunityReports)
    .where(eq(opportunityReports.id, id))
    .limit(1);

  if (!row) throw notFound('Report');
  return row.message;
}

export async function pendingCount(): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(opportunityReports)
    .where(and(eq(opportunityReports.status, 'pending')));
  return row?.value ?? 0;
}
