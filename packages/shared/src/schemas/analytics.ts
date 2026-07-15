import { z } from 'zod';

/**
 * Analytics contracts. Every number here is computed from a real table —
 * `job_views`, `applications`, `saved_jobs` — never estimated client-side.
 */

export const analyticsQuerySchema = z.object({
  days: z.coerce.number().int().min(7).max(365).default(30),
});
export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;

export interface AnalyticsTotals {
  totalJobs: number;
  publishedJobs: number;
  totalUsers: number;
  totalStudents: number;
  totalApplications: number;
  totalSaves: number;
  totalViews: number;
  totalCompanies: number;
  closingSoon: number;
}

export interface TimeSeriesPoint {
  date: string; // YYYY-MM-DD
  views: number;
  applications: number;
}

export interface CategoryBreakdown {
  categoryId: string;
  name: string;
  color: string | null;
  jobs: number;
  applications: number;
}

export interface TopJob {
  id: string;
  slug: string;
  role: string;
  companyName: string;
  views: number;
  applications: number;
  saves: number;
}

export interface StatusBreakdown {
  status: string;
  count: number;
}

export interface AnalyticsOverview {
  totals: AnalyticsTotals;
  timeSeries: TimeSeriesPoint[];
  byCategory: CategoryBreakdown[];
  topJobs: TopJob[];
  applicationFunnel: StatusBreakdown[];
}

export interface AdminDashboardStats {
  totals: AnalyticsTotals;
  recentJobs: Array<{
    id: string;
    slug: string;
    role: string;
    companyName: string;
    status: string;
    createdAt: string;
  }>;
  recentUsers: Array<{
    id: string;
    fullName: string;
    email: string;
    createdAt: string;
  }>;
}
