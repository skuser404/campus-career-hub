'use client';

import { BookmarkX } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';
import { JobCard } from '@/components/jobs/job-card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/primitives';
import { JobGridSkeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState, PageHeader } from '@/components/ui/states';
import { useSavedJobs } from '@/hooks/use-jobs';

/** Suspense boundary: `useSearchParams()` cannot be prerendered without one. */
export default function SavedPage() {
  return (
    <React.Suspense
      fallback={
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <PageHeader title="Saved" description="Opportunities you have bookmarked." />
          <JobGridSkeleton count={6} />
        </div>
      }
    >
      <SavedContent />
    </React.Suspense>
  );
}

function SavedContent() {
  const router = useRouter();
  const params = useSearchParams();

  const sort = params.get('sort') === 'deadline' ? 'deadline' : 'newest';

  const rawPage = Number(params.get('page') ?? '1');
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;

  const { data, isLoading, isError, refetch } = useSavedJobs({ sort, page });

  const jobs = data?.items ?? [];
  const pagination = data?.pagination;

  const setSort = (next: string) => {
    router.push(next === 'newest' ? '/saved' : `/saved?sort=${next}`);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <PageHeader
        title="Saved"
        description="Opportunities you have bookmarked. Sort by deadline to see what needs attention first."
        action={
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="w-48" aria-label="Sort saved jobs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Recently saved</SelectItem>
              <SelectItem value="deadline">Closing soonest</SelectItem>
            </SelectContent>
          </Select>
        }
      />

      {isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : isLoading ? (
        <JobGridSkeleton count={6} />
      ) : jobs.length === 0 ? (
        <EmptyState
          icon={BookmarkX}
          title="Nothing saved yet"
          description="Tap the bookmark icon on any opportunity and it will show up here — along with a countdown to its deadline."
          action={
            <Button asChild>
              <Link href="/opportunities">Browse opportunities</Link>
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {jobs.map((job) => (
              <JobCard key={job.id} job={job} isAuthenticated />
            ))}
          </div>

          {pagination && pagination.totalPages > 1 ? (
            <nav className="mt-10 flex items-center justify-center gap-2" aria-label="Pagination">
              <Button
                variant="outline"
                size="sm"
                disabled={!pagination.hasPrev}
                onClick={() => router.push(`/saved?sort=${sort}&page=${page - 1}`)}
              >
                Previous
              </Button>

              <span className="px-4 text-sm text-muted-foreground">
                Page {pagination.page} of {pagination.totalPages}
              </span>

              <Button
                variant="outline"
                size="sm"
                disabled={!pagination.hasNext}
                onClick={() => router.push(`/saved?sort=${sort}&page=${page + 1}`)}
              >
                Next
              </Button>
            </nav>
          ) : null}
        </>
      )}
    </div>
  );
}
