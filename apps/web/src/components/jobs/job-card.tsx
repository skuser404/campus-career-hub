'use client';

import { JOB_MODE_LABELS, type Job } from '@cch/shared';
import { motion } from 'framer-motion';
import { Bookmark, BookmarkCheck, CalendarClock, Check, MapPin, Wallet } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useToggleSave } from '@/hooks/use-jobs';
import { cn, formatSalary, getDeadlineInfo, type DeadlineUrgency } from '@/lib/utils';

/** How loudly the deadline badge should shout. Derived once, used everywhere. */
const URGENCY_VARIANT: Record<DeadlineUrgency, 'destructive' | 'warning' | 'muted' | 'outline'> = {
  expired: 'muted',
  today: 'destructive',
  urgent: 'destructive',
  soon: 'warning',
  normal: 'outline',
  none: 'muted',
};

interface JobCardProps {
  job: Job;
  /** Whether the viewer is signed in — controls whether Save is offered at all. */
  isAuthenticated?: boolean;
}

export function JobCard({ job, isAuthenticated = false }: JobCardProps) {
  const toggleSave = useToggleSave();
  const deadline = getDeadlineInfo(job.deadline);

  const handleSave = (e: React.MouseEvent) => {
    // The whole card is a link. Without this, saving would also navigate.
    e.preventDefault();
    e.stopPropagation();
    toggleSave.mutate({ jobId: job.id, isSaved: Boolean(job.isSaved) });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="h-full"
    >
      <Card interactive className="group relative flex h-full flex-col p-5">
        {/* The entire card is the click target, but the accessible name comes from
            the heading below rather than from this overlay, so a screen reader
            announces the role and company — not "link". */}
        <Link
          href={`/opportunities/${job.slug}`}
          className="absolute inset-0 z-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`${job.role} at ${job.company.name}`}
        />

        <div className="relative z-10 flex items-start gap-3">
          {job.company.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={job.company.logoUrl}
              alt=""
              className="h-11 w-11 shrink-0 rounded-lg border border-border object-contain p-1"
              loading="lazy"
            />
          ) : (
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-sm font-semibold text-muted-foreground">
              {job.company.name.charAt(0)}
            </div>
          )}

          <div className="min-w-0 flex-1">
            <h3 className="truncate font-semibold leading-snug group-hover:text-primary">
              {job.role}
            </h3>
            <p className="truncate text-sm text-muted-foreground">{job.company.name}</p>
          </div>

          {isAuthenticated ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleSave}
              disabled={toggleSave.isPending}
              className="relative z-20 -mr-1 -mt-1 shrink-0"
              aria-label={job.isSaved ? 'Remove from saved' : 'Save this opportunity'}
              aria-pressed={Boolean(job.isSaved)}
            >
              {job.isSaved ? (
                <BookmarkCheck className="h-4 w-4 text-primary" />
              ) : (
                <Bookmark className="h-4 w-4 text-muted-foreground" />
              )}
            </Button>
          ) : null}
        </div>

        <p className="relative z-10 mt-3 line-clamp-2 text-sm text-muted-foreground">
          {job.description}
        </p>

        <div className="relative z-10 mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
          {job.location ? (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              {job.location}
            </span>
          ) : null}

          <span className="inline-flex items-center gap-1">
            <Wallet className="h-3.5 w-3.5" />
            {formatSalary(job.salaryMin, job.salaryMax, job.salaryCurrency, job.salaryText)}
          </span>
        </div>

        <div className="relative z-10 mt-4 flex flex-wrap gap-1.5">
          <Badge
            variant="default"
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

          {job.tags.slice(0, 2).map((tag) => (
            <Badge key={tag.id} variant="outline">
              {tag.name}
            </Badge>
          ))}

          {job.tags.length > 2 ? (
            <Badge variant="outline">+{job.tags.length - 2}</Badge>
          ) : null}
        </div>

        {/* `mt-auto` pins the footer to the bottom, so cards in a grid line up
            their deadlines regardless of how long the description ran. */}
        <div className="relative z-10 mt-auto flex items-center justify-between gap-2 border-t border-border pt-4 [margin-top:auto] [padding-top:1rem]">
          <Badge variant={URGENCY_VARIANT[deadline.urgency]} className="gap-1">
            <CalendarClock className="h-3 w-3" />
            {deadline.label}
          </Badge>

          {job.isApplied ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
              <Check className="h-3.5 w-3.5" strokeWidth={3} />
              Applied
            </span>
          ) : null}
        </div>
      </Card>
    </motion.div>
  );
}

/** A tighter variant for sidebars and dashboard rails, where space is scarce. */
export function JobCardCompact({ job }: { job: Job }) {
  const deadline = getDeadlineInfo(job.deadline);

  return (
    <Link
      href={`/opportunities/${job.slug}`}
      className={cn(
        'flex items-center gap-3 rounded-lg border border-border bg-card p-3 transition-colors',
        'hover:border-foreground/20 hover:bg-accent/50',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      )}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-xs font-semibold text-muted-foreground">
        {job.company.name.charAt(0)}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{job.role}</p>
        <p className="truncate text-xs text-muted-foreground">{job.company.name}</p>
      </div>

      <Badge variant={URGENCY_VARIANT[deadline.urgency]} className="shrink-0">
        {deadline.label}
      </Badge>
    </Link>
  );
}
