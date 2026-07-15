'use client';

import { JOB_MODE_LABELS } from '@cch/shared';
import {
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  Building2,
  CalendarClock,
  Check,
  CheckCircle2,
  ExternalLink,
  Eye,
  GraduationCap,
  MapPin,
  Wallet,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/primitives';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { useCurrentUser } from '@/hooks/use-auth';
import { recordJobView, useJob, useMarkApplied, useToggleSave } from '@/hooks/use-jobs';
import { formatDateTime, formatSalary, getDeadlineInfo } from '@/lib/utils';

export default function JobDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: user } = useCurrentUser();
  const { data: job, isLoading, isError, refetch } = useJob(slug);

  const toggleSave = useToggleSave();
  const markApplied = useMarkApplied();

  /**
   * Record the view once the job resolves.
   *
   * Keyed on `job?.id` so it fires once per opportunity. React 18's StrictMode
   * double-invokes effects in development, which would double-count — but the
   * server treats a view as an append, and the alternative (a ref guard) would
   * also suppress a legitimate second view after client-side navigation back to
   * the same page. A dev-only double count is the cheaper error.
   */
  React.useEffect(() => {
    if (job?.id) recordJobView(job.id);
  }, [job?.id]);

  if (isError) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
        <ErrorState
          title="Opportunity not found"
          message="It may have been removed, or the link may be wrong."
          onRetry={() => void refetch()}
        />
        <div className="mt-6 text-center">
          <Button variant="ghost" asChild>
            <Link href="/opportunities">
              <ArrowLeft className="h-4 w-4" />
              Back to opportunities
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  if (isLoading || !job) {
    return (
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-10 sm:px-6 lg:px-8">
        <Skeleton className="h-4 w-32" />
        <div className="flex gap-4">
          <Skeleton className="h-16 w-16 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-7 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
          </div>
        </div>
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  const deadline = getDeadlineInfo(job.deadline);
  const isExpired = deadline.urgency === 'expired';

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
      <Button variant="ghost" size="sm" className="mb-6 -ml-2" asChild>
        <Link href="/opportunities">
          <ArrowLeft className="h-4 w-4" />
          All opportunities
        </Link>
      </Button>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        {job.company.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={job.company.logoUrl}
            alt=""
            className="h-16 w-16 shrink-0 rounded-xl border border-border object-contain p-2"
          />
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-border bg-muted text-xl font-semibold text-muted-foreground">
            {job.company.name.charAt(0)}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap gap-1.5">
            <Badge
              style={
                job.category.color
                  ? {
                      backgroundColor: `color-mix(in oklch, ${job.category.color} 12%, transparent)`,
                      color: job.category.color,
                    }
                  : undefined
              }
            >
              {job.category.name}
            </Badge>
            <Badge variant="secondary">{JOB_MODE_LABELS[job.mode]}</Badge>
            {job.isApplied ? (
              <Badge variant="success" className="gap-1">
                <Check className="h-3 w-3" strokeWidth={3} />
                Applied
              </Badge>
            ) : null}
          </div>

          <h1 className="text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">
            {job.role}
          </h1>

          <div className="mt-2 flex items-center gap-1.5 text-muted-foreground">
            <Building2 className="h-4 w-4" />
            {job.company.website ? (
              <a
                href={job.company.website}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium hover:text-foreground hover:underline"
              >
                {job.company.name}
              </a>
            ) : (
              <span className="font-medium">{job.company.name}</span>
            )}
          </div>
        </div>
      </div>

      {/* ── Facts ───────────────────────────────────────────────────────── */}
      <Card className="mt-8">
        <CardContent className="grid gap-5 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <Fact
            icon={Wallet}
            label="Compensation"
            value={formatSalary(job.salaryMin, job.salaryMax, job.salaryCurrency, job.salaryText)}
          />
          <Fact icon={MapPin} label="Location" value={job.location ?? 'Not specified'} />
          <Fact
            icon={CalendarClock}
            label="Deadline"
            value={job.deadline ? formatDateTime(job.deadline) : 'No deadline'}
            highlight={deadline.urgency === 'urgent' || deadline.urgency === 'today'}
          />
          <Fact icon={Eye} label="Views" value={String(job.viewsCount)} />
        </CardContent>
      </Card>

      {/* ── Actions ─────────────────────────────────────────────────────── */}
      <div className="sticky top-16 z-20 mt-6 rounded-xl border border-border bg-background/90 p-4 backdrop-blur-md">
        {isExpired ? (
          <p className="mb-3 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
            This deadline has passed. The link may no longer accept applications.
          </p>
        ) : deadline.urgency === 'today' || deadline.urgency === 'urgent' ? (
          <p className="mb-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
            {deadline.label} — apply now if you intend to.
          </p>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button size="lg" className="flex-1" asChild>
            {/*
             * `rel="noopener"` is not optional on a target=_blank link. Without
             * it the destination page receives a `window.opener` handle back
             * into this tab and can redirect it — a phishing vector, and these
             * links are admin-supplied.
             */}
            <a href={job.applicationLink} target="_blank" rel="noopener noreferrer">
              Apply on company site
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>

          {user ? (
            <>
              <Button
                size="lg"
                variant={job.isApplied ? 'success' : 'outline'}
                disabled={job.isApplied || markApplied.isPending}
                loading={markApplied.isPending}
                onClick={() => markApplied.mutate({ jobId: job.id, status: 'applied' })}
                className="flex-1 sm:flex-none"
              >
                {job.isApplied ? (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Applied
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    Mark as applied
                  </>
                )}
              </Button>

              <Button
                size="lg"
                variant="outline"
                onClick={() => toggleSave.mutate({ jobId: job.id, isSaved: Boolean(job.isSaved) })}
                disabled={toggleSave.isPending}
                aria-pressed={Boolean(job.isSaved)}
                className="sm:w-auto"
              >
                {job.isSaved ? (
                  <>
                    <BookmarkCheck className="h-4 w-4 text-primary" />
                    Saved
                  </>
                ) : (
                  <>
                    <Bookmark className="h-4 w-4" />
                    Save
                  </>
                )}
              </Button>
            </>
          ) : (
            <Button size="lg" variant="outline" asChild className="flex-1 sm:flex-none">
              <Link href="/login">Sign in to save & track</Link>
            </Button>
          )}
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <div className="mt-10 space-y-8">
        <section>
          <h2 className="mb-3 text-lg font-semibold tracking-tight">About this opportunity</h2>
          {/*
           * `whitespace-pre-wrap` renders the admin's line breaks, and React
           * escapes the content — so a description containing <script> is shown
           * as literal text rather than executed. There is deliberately no
           * dangerouslySetInnerHTML anywhere in this codebase.
           */}
          <p className="whitespace-pre-wrap leading-relaxed text-muted-foreground">
            {job.description}
          </p>
        </section>

        {job.eligibility ? (
          <>
            <Separator />
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold tracking-tight">
                <GraduationCap className="h-5 w-5 text-primary" />
                Eligibility
              </h2>
              <p className="whitespace-pre-wrap leading-relaxed text-muted-foreground">
                {job.eligibility}
              </p>
            </section>
          </>
        ) : null}

        {job.tags.length > 0 ? (
          <>
            <Separator />
            <section>
              <h2 className="mb-3 text-lg font-semibold tracking-tight">Skills & tags</h2>
              <div className="flex flex-wrap gap-2">
                {job.tags.map((tag) => (
                  <Link key={tag.id} href={`/opportunities?tags=${tag.slug}`}>
                    <Badge
                      variant="outline"
                      className="cursor-pointer transition-colors hover:border-primary hover:text-primary"
                    >
                      {tag.name}
                    </Badge>
                  </Link>
                ))}
              </div>
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}

function Fact({
  icon: Icon,
  label,
  value,
  highlight,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        {label}
      </div>
      <p
        className={
          highlight ? 'mt-1 text-sm font-semibold text-destructive' : 'mt-1 text-sm font-medium'
        }
      >
        {value}
      </p>
    </div>
  );
}
