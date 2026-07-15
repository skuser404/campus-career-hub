import {
  CLOSING_SOON_DAYS,
  type AdminDashboardStats,
  type AnalyticsOverview,
  type AnalyticsTotals,
  type CategoryBreakdown,
  type StatusBreakdown,
  type TimeSeriesPoint,
  type TopJob,
} from '@cch/shared';
import { and, count, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  applications,
  categories,
  companies,
  jobViews,
  jobs,
  savedJobs,
  users,
} from '../../db/schema';

/**
 * Analytics.
 *
 * Every number is computed from a real table. Nothing here is estimated,
 * sampled, or invented — which is the entire reason `job_views` exists as a
 * table rather than as a bare counter column.
 */

async function getTotals(): Promise<AnalyticsTotals> {
  const now = new Date();
  const horizon = new Date(Date.now() + CLOSING_SOON_DAYS * 86_400_000);

  const [
    totalJobs,
    publishedJobs,
    totalUsers,
    totalStudents,
    totalApplications,
    totalSaves,
    totalViews,
    totalCompanies,
    closingSoon,
  ] = await Promise.all([
    db.select({ v: count() }).from(jobs),
    db.select({ v: count() }).from(jobs).where(eq(jobs.status, 'published')),
    db.select({ v: count() }).from(users),
    db.select({ v: count() }).from(users).where(eq(users.role, 'student')),
    db.select({ v: count() }).from(applications),
    db.select({ v: count() }).from(savedJobs),
    db.select({ v: count() }).from(jobViews),
    db.select({ v: count() }).from(companies),
    db
      .select({ v: count() })
      .from(jobs)
      .where(
        and(eq(jobs.status, 'published'), gte(jobs.deadline, now), lte(jobs.deadline, horizon)),
      ),
  ]);

  return {
    totalJobs: totalJobs[0]?.v ?? 0,
    publishedJobs: publishedJobs[0]?.v ?? 0,
    totalUsers: totalUsers[0]?.v ?? 0,
    totalStudents: totalStudents[0]?.v ?? 0,
    totalApplications: totalApplications[0]?.v ?? 0,
    totalSaves: totalSaves[0]?.v ?? 0,
    totalViews: totalViews[0]?.v ?? 0,
    totalCompanies: totalCompanies[0]?.v ?? 0,
    closingSoon: closingSoon[0]?.v ?? 0,
  };
}

/**
 * Views and applications per day.
 *
 * `generate_series` produces every date in the range and LEFT JOINs the counts
 * onto it, so a day with zero activity appears as a zero rather than vanishing.
 * Without it the chart's x-axis would silently skip quiet days and imply a
 * continuity that does not exist.
 */
async function getTimeSeries(days: number): Promise<TimeSeriesPoint[]> {
  const rows = await db.execute<{ date: string; views: number; applications: number }>(sql`
    WITH series AS (
      SELECT generate_series(
        (CURRENT_DATE - (${days - 1}::int * INTERVAL '1 day'))::date,
        CURRENT_DATE,
        INTERVAL '1 day'
      )::date AS day
    ),
    view_counts AS (
      SELECT ${jobViews.viewedAt}::date AS day, COUNT(*)::int AS n
      FROM ${jobViews}
      WHERE ${jobViews.viewedAt} >= CURRENT_DATE - (${days - 1}::int * INTERVAL '1 day')
      GROUP BY 1
    ),
    application_counts AS (
      SELECT ${applications.appliedAt}::date AS day, COUNT(*)::int AS n
      FROM ${applications}
      WHERE ${applications.appliedAt} >= CURRENT_DATE - (${days - 1}::int * INTERVAL '1 day')
      GROUP BY 1
    )
    SELECT
      to_char(s.day, 'YYYY-MM-DD')      AS date,
      COALESCE(v.n, 0)                  AS views,
      COALESCE(a.n, 0)                  AS applications
    FROM series s
    LEFT JOIN view_counts        v ON v.day = s.day
    LEFT JOIN application_counts a ON a.day = s.day
    ORDER BY s.day ASC
  `);

  return rows.rows.map((r) => ({
    date: r.date,
    views: Number(r.views),
    applications: Number(r.applications),
  }));
}

async function getCategoryBreakdown(): Promise<CategoryBreakdown[]> {
  const rows = await db
    .select({
      categoryId: categories.id,
      name: categories.name,
      color: categories.color,
      jobs: sql<number>`COUNT(DISTINCT ${jobs.id})::int`,
      applications: sql<number>`COUNT(DISTINCT ${applications.id})::int`,
    })
    .from(categories)
    // LEFT JOIN, so a category with no opportunities still appears — at zero.
    // An INNER JOIN would erase it from the chart entirely.
    .leftJoin(jobs, and(eq(jobs.categoryId, categories.id), eq(jobs.status, 'published')))
    .leftJoin(applications, eq(applications.jobId, jobs.id))
    .groupBy(categories.id, categories.name, categories.color, categories.sortOrder)
    .orderBy(categories.sortOrder);

  return rows.map((r) => ({
    categoryId: r.categoryId,
    name: r.name,
    color: r.color,
    jobs: Number(r.jobs),
    applications: Number(r.applications),
  }));
}

async function getTopJobs(limit = 10): Promise<TopJob[]> {
  const rows = await db
    .select({
      id: jobs.id,
      slug: jobs.slug,
      role: jobs.role,
      companyName: companies.name,
      views: jobs.viewsCount,
      applications: sql<number>`(
        SELECT COUNT(*)::int FROM ${applications} WHERE ${applications.jobId} = ${jobs.id}
      )`,
      saves: sql<number>`(
        SELECT COUNT(*)::int FROM ${savedJobs} WHERE ${savedJobs.jobId} = ${jobs.id}
      )`,
    })
    .from(jobs)
    .innerJoin(companies, eq(jobs.companyId, companies.id))
    .where(eq(jobs.status, 'published'))
    .orderBy(desc(jobs.viewsCount))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    role: r.role,
    companyName: r.companyName,
    views: Number(r.views),
    applications: Number(r.applications),
    saves: Number(r.saves),
  }));
}

async function getApplicationFunnel(): Promise<StatusBreakdown[]> {
  const rows = await db
    .select({ status: applications.status, count: count() })
    .from(applications)
    .groupBy(applications.status);

  return rows.map((r) => ({ status: r.status, count: Number(r.count) }));
}

export async function getOverview(days: number): Promise<AnalyticsOverview> {
  const [totals, timeSeries, byCategory, topJobs, applicationFunnel] = await Promise.all([
    getTotals(),
    getTimeSeries(days),
    getCategoryBreakdown(),
    getTopJobs(),
    getApplicationFunnel(),
  ]);

  return { totals, timeSeries, byCategory, topJobs, applicationFunnel };
}

export async function getDashboard(): Promise<AdminDashboardStats> {
  const [totals, recentJobs, recentUsers, counts, upcoming, pendingReports] = await Promise.all([
    getTotals(),

    db
      .select({
        id: jobs.id,
        slug: jobs.slug,
        role: jobs.role,
        companyName: companies.name,
        status: jobs.status,
        createdAt: jobs.createdAt,
      })
      .from(jobs)
      .innerJoin(companies, eq(jobs.companyId, companies.id))
      .orderBy(desc(jobs.createdAt))
      .limit(6),

    db
      .select({
        id: users.id,
        fullName: users.fullName,
        email: users.email,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.role, 'student'))
      .orderBy(desc(users.createdAt))
      .limit(6),

    // Closed (deadline passed) and expiring-today counts, both over published
    // opportunities — computed against `now()` so they are always current
    // without a background job flipping statuses.
    db.execute<{ closed: number; expired_today: number }>(sql`
      SELECT
        COUNT(*) FILTER (
          WHERE status = 'published' AND deadline IS NOT NULL AND deadline < now()
        )::int AS closed,
        COUNT(*) FILTER (
          WHERE status = 'published' AND deadline::date = current_date AND deadline >= now()
        )::int AS expired_today
      FROM jobs
    `),

    db
      .select({
        id: jobs.id,
        slug: jobs.slug,
        role: jobs.role,
        companyName: companies.name,
        deadline: jobs.deadline,
      })
      .from(jobs)
      .innerJoin(companies, eq(jobs.companyId, companies.id))
      .where(
        and(
          eq(jobs.status, 'published'),
          gte(jobs.deadline, new Date()),
          lte(jobs.deadline, new Date(Date.now() + CLOSING_SOON_DAYS * 86_400_000)),
        ),
      )
      .orderBy(sql`${jobs.deadline} ASC`)
      .limit(6),

    // Opportunity reports awaiting review. The table may not exist yet (it is
    // added in a later migration), so a failure here degrades to zero rather than
    // taking the whole dashboard down.
    db
      .execute<{ n: number }>(
        sql`SELECT COUNT(*)::int AS n FROM opportunity_reports WHERE status = 'pending'`,
      )
      .then((r) => r.rows[0]?.n ?? 0)
      .catch(() => 0),
  ]);

  const countRow = counts.rows[0] ?? { closed: 0, expired_today: 0 };

  return {
    totals,
    closedCount: Number(countRow.closed),
    expiredTodayCount: Number(countRow.expired_today),
    pendingReportsCount: pendingReports,
    upcomingDeadlines: upcoming
      .filter((u) => u.deadline)
      .map((u) => ({
        id: u.id,
        slug: u.slug,
        role: u.role,
        companyName: u.companyName,
        deadline: (u.deadline as Date).toISOString(),
      })),
    recentJobs: recentJobs.map((j) => ({ ...j, createdAt: j.createdAt.toISOString() })),
    recentUsers: recentUsers.map((u) => ({ ...u, createdAt: u.createdAt.toISOString() })),
  };
}
