'use client';

import type { Announcement } from '@cch/shared';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  Bookmark,
  CalendarClock,
  Megaphone,
  PartyPopper,
  Search,
  Send,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import { JobCardCompact } from '@/components/jobs/job-card';
import { ReportDialog } from '@/components/reports/report-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatCardSkeleton } from '@/components/ui/skeleton';
import { EmptyState, PageHeader } from '@/components/ui/states';
import { useCurrentUser } from '@/hooks/use-auth';
import { useStudentStats, useUpcomingDeadlines } from '@/hooks/use-jobs';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

export default function DashboardPage() {
  const { data: user } = useCurrentUser();
  const { data: stats, isLoading: statsLoading } = useStudentStats();
  const { data: deadlines, isLoading: deadlinesLoading } = useUpcomingDeadlines();

  const { data: announcements } = useQuery({
    queryKey: ['announcements', 'active'],
    queryFn: () => api.get<Announcement[]>('/announcements/active'),
  });

  const firstName = user?.fullName.split(' ')[0] ?? 'there';

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <PageHeader
        title={`Welcome back, ${firstName}`}
        description="Your saved opportunities, deadlines, and applications."
        action={
          <Button asChild>
            <Link href="/opportunities">
              <Search className="h-4 w-4" />
              Find opportunities
            </Link>
          </Button>
        }
      />

      {/* ── Stats ───────────────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statsLoading ? (
          Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard
              label="Saved"
              value={stats?.savedCount ?? 0}
              icon={Bookmark}
              href="/saved"
            />
            <StatCard
              label="Applied"
              value={stats?.appliedCount ?? 0}
              icon={Send}
              href="/applications"
            />
            <StatCard
              label="Closing soon"
              value={stats?.closingSoonCount ?? 0}
              icon={CalendarClock}
              href="/saved?sort=deadline"
              // The one number that should make someone act today. If it is
              // non-zero it turns red, because that is the entire point of the
              // product: a deadline you saved and have not yet acted on.
              urgent={(stats?.closingSoonCount ?? 0) > 0}
            />
            <StatCard
              label="Offers"
              value={stats?.offersCount ?? 0}
              icon={PartyPopper}
              href="/applications?status=offered"
              success={(stats?.offersCount ?? 0) > 0}
            />
          </>
        )}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        {/* ── Deadline feed ─────────────────────────────────────────────── */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="h-4 w-4 text-warning" />
              Your deadlines
            </CardTitle>

            <Button variant="ghost" size="sm" asChild>
              <Link href="/saved">
                View saved <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>

          <CardContent>
            {deadlinesLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
                ))}
              </div>
            ) : deadlines && deadlines.length > 0 ? (
              <div className="space-y-2">
                {deadlines.map((job) => (
                  <JobCardCompact key={job.id} job={job} />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={Sparkles}
                title="No pending deadlines"
                description="Opportunities you save — and have not yet applied to — appear here, sorted by what closes first."
                action={
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/opportunities">Browse opportunities</Link>
                  </Button>
                }
                className="border-0 bg-transparent py-10"
              />
            )}
          </CardContent>
        </Card>

        {/* ── Notice Board ──────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Megaphone className="h-4 w-4 text-primary" />
              Notice Board
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* The fixed notice — the channel for students to surface a placement
                message that has not made it onto the site yet. */}
            <div className="rounded-lg border border-primary/25 bg-primary/5 p-3">
              <p className="text-xs leading-relaxed text-muted-foreground">
                Did your department get a placement opportunity that isn&rsquo;t here yet? Send us the
                official WhatsApp message and we&rsquo;ll publish it for everyone.
              </p>
              <div className="mt-2.5">
                <ReportDialog
                  trigger={
                    <Button size="sm">
                      <Megaphone className="h-4 w-4" />
                      Report Missing Opportunity
                    </Button>
                  }
                />
              </div>
            </div>

            {/* Announcements, most recent first (the API orders by priority then date). */}
            {announcements && announcements.length > 0 ? (
              <ul className="space-y-4">
                {announcements.slice(0, 4).map((a) => (
                  <li key={a.id} className="border-b border-border pb-4 last:border-0 last:pb-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium leading-snug">{a.title}</p>
                      {a.priority === 'urgent' ? (
                        <Badge variant="destructive" className="shrink-0">
                          Urgent
                        </Badge>
                      ) : a.priority === 'high' ? (
                        <Badge variant="warning" className="shrink-0">
                          Important
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{a.body}</p>
                  </li>
                ))}
              </ul>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  href,
  urgent,
  success,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  href: string;
  urgent?: boolean;
  success?: boolean;
}) {
  return (
    <Link
      href={href}
      className="group rounded-xl border border-border bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-lg',
            urgent
              ? 'bg-destructive/10 text-destructive'
              : success
                ? 'bg-success/10 text-success'
                : 'bg-muted text-muted-foreground',
          )}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>

      <p
        className={cn(
          'mt-3 text-3xl font-semibold tabular-nums tracking-tight',
          urgent && 'text-destructive',
          success && 'text-success',
        )}
      >
        {value}
      </p>
    </Link>
  );
}
