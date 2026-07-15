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
  const [totals, recentJobs, recentUsers] = await Promise.all([
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
      .limit(5),

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
      .limit(5),
  ]);

  return {
    totals,
    recentJobs: recentJobs.map((j) => ({ ...j, createdAt: j.createdAt.toISOString() })),
    recentUsers: recentUsers.map((u) => ({ ...u, createdAt: u.createdAt.toISOString() })),
  };
}
