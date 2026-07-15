'use client';

import {
  AlarmClock,
  Bookmark,
  Briefcase,
  Building2,
  CalendarClock,
  CalendarX,
  Eye,
  Inbox,
  Plus,
  Send,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatCardSkeleton } from '@/components/ui/skeleton';
import { ErrorState, PageHeader } from '@/components/ui/states';
import { useAdminDashboard } from '@/hooks/use-admin';
import { cn, formatRelative, getDeadlineInfo } from '@/lib/utils';

export default function AdminOverviewPage() {
  const { data, isLoading, isError, refetch } = useAdminDashboard();

  if (isError) {
    return <ErrorState onRetry={() => void refetch()} />;
  }

  const t = data?.totals;

  return (
    <div>
      <PageHeader
        title="Overview"
        description="Everything happening across the platform."
        action={
          <Button asChild>
            <Link href="/admin/jobs/new">
              <Plus className="h-4 w-4" />
              New opportunity
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {isLoading ? (
          Array.from({ length: 8 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <Stat label="Published" value={t?.publishedJobs ?? 0} sub={`${t?.totalJobs ?? 0} total`} icon={Briefcase} />
            <Stat
              label="Closing soon"
              value={t?.closingSoon ?? 0}
              sub="within 7 days"
              icon={CalendarClock}
              urgent={(t?.closingSoon ?? 0) > 0}
            />
            <Stat
              label="Expired today"
              value={data?.expiredTodayCount ?? 0}
              sub="deadlines today"
              icon={AlarmClock}
              urgent={(data?.expiredTodayCount ?? 0) > 0}
              href="/admin/jobs"
            />
            <Stat
              label="Closed"
              value={data?.closedCount ?? 0}
              sub="deadline passed"
              icon={CalendarX}
              href="/admin/jobs"
            />
            <Stat
              label="Pending reports"
              value={data?.pendingReportsCount ?? 0}
              sub="awaiting review"
              icon={Inbox}
              urgent={(data?.pendingReportsCount ?? 0) > 0}
            />
            <Stat label="Students" value={t?.totalStudents ?? 0} sub={`${t?.totalUsers ?? 0} users`} icon={Users} href="/admin/students" />
            <Stat label="Companies" value={t?.totalCompanies ?? 0} icon={Building2} href="/admin/companies" />
            <Stat label="Applications" value={t?.totalApplications ?? 0} icon={Send} />
            <Stat label="Saves" value={t?.totalSaves ?? 0} icon={Bookmark} />
            <Stat label="Views" value={t?.totalViews ?? 0} icon={Eye} />
          </>
        )}
      </div>

      {/* Upcoming deadlines — the ones to chase students about. */}
      {data && data.upcomingDeadlines.length > 0 ? (
        <Card className="mt-6 border-warning/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="h-4 w-4 text-warning" />
              Upcoming deadlines
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {data.upcomingDeadlines.map((d) => {
                const info = getDeadlineInfo(d.deadline);
                return (
                  <li key={d.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <Link
                        href={`/opportunities/${d.slug}`}
                        className="truncate text-sm font-medium hover:text-primary hover:underline"
                      >
                        {d.role}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">{d.companyName}</p>
                    </div>
                    <Badge
                      variant={info.urgency === 'urgent' || info.urgency === 'today' ? 'destructive' : 'warning'}
                      className="shrink-0"
                    >
                      {info.label}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Recent opportunities</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/admin/jobs">View all</Link>
            </Button>
          </CardHeader>

          <CardContent>
            {data && data.recentJobs.length > 0 ? (
              <ul className="space-y-3">
                {data.recentJobs.map((job) => (
                  <li key={job.id} className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/admin/jobs/${job.id}/edit`}
                        className="truncate text-sm font-medium hover:text-primary hover:underline"
                      >
                        {job.role}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">
                        {job.companyName} · {formatRelative(job.createdAt)}
                      </p>
                    </div>

                    <Badge
                      variant={
                        job.status === 'published'
                          ? 'success'
                          : job.status === 'draft'
                            ? 'muted'
                            : 'secondary'
                      }
                      className="shrink-0"
                    >
                      {job.status}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No opportunities yet.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">New students</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/admin/students">View all</Link>
            </Button>
          </CardHeader>

          <CardContent>
            {data && data.recentUsers.length > 0 ? (
              <ul className="space-y-3">
                {data.recentUsers.map((u) => (
                  <li key={u.id} className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{u.fullName}</p>
                      <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatRelative(u.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No students registered yet.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  icon: Icon,
  urgent,
  href,
}: {
  label: string;
  value: number;
  sub?: string;
  icon: React.ElementType;
  urgent?: boolean;
  href?: string;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-lg',
            urgent ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground',
          )}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>

      <p
        className={cn(
          'mt-3 text-2xl font-semibold tabular-nums tracking-tight',
          urgent && 'text-destructive',
        )}
      >
        {value.toLocaleString('en-IN')}
      </p>

      {sub ? <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p> : null}
    </>
  );

  const className = cn(
    'block rounded-xl border border-border bg-card p-5',
    href && 'transition-colors hover:border-foreground/20 hover:bg-accent/40',
  );

  return href ? (
    <Link href={href} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}
