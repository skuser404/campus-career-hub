'use client';

import {
  JOB_MODES,
  JOB_SORT_OPTIONS,
  type JobMode,
  type JobQuery,
  type JobSort,
} from '@cch/shared';
import { SearchX } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';
import { JobCard } from '@/components/jobs/job-card';
import { JobFilters, type FilterState } from '@/components/jobs/job-filters';
import { Button } from '@/components/ui/button';
import { JobGridSkeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState, PageHeader } from '@/components/ui/states';
import { useCurrentUser } from '@/hooks/use-auth';
import { useJobs } from '@/hooks/use-jobs';
import { toSearchParams } from '@/lib/utils';

/**
 * The search page.
 *
 * Filter state lives in the URL, not in React state. That is what makes a
 * filtered search shareable, bookmarkable, and survivable across a refresh —
 * paste the link into a WhatsApp group and it opens on exactly the same results.
 * Given that the whole product exists because WhatsApp links get lost, a search
 * URL that means nothing out of context would be a poor joke.
 */
/**
 * The URL is user input — anyone can type `?sort=drop-table` — so it is narrowed
 * against the shared constants rather than trusted. An unrecognised value falls
 * back to the default instead of being forwarded to the API as garbage.
 */
const asSort = (v: string | null): JobSort =>
  JOB_SORT_OPTIONS.includes(v as JobSort) ? (v as JobSort) : 'newest';

const asMode = (v: string | null): JobMode | '' =>
  JOB_MODES.includes(v as JobMode) ? (v as JobMode) : '';

const asPage = (v: string | null): number => {
  const n = Number(v ?? '1');
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
};

/**
 * `useSearchParams()` forces a client-side bail-out during prerendering, so Next
 * requires a Suspense boundary around it. Without one the whole route falls back
 * to dynamic rendering and the shell can no longer be served statically.
 *
 * The fallback renders the real page furniture with a skeleton grid, so what
 * appears first is the page — not a blank screen that then becomes the page.
 */
export default function OpportunitiesPage() {
  return (
    <React.Suspense fallback={<OpportunitiesFallback />}>
      <OpportunitiesContent />
    </React.Suspense>
  );
}

function OpportunitiesFallback() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <PageHeader
        title="Opportunities"
        description="Every placement, internship, hackathon, certification and event — in one searchable place."
      />
      <JobGridSkeleton count={9} />
    </div>
  );
}

function OpportunitiesContent() {
  const router = useRouter();
  const params = useSearchParams();
  const { data: user } = useCurrentUser();

  /**
   * Memoised on the search string.
   *
   * Without this, `filters` is a brand-new object on every render, so the
   * `useCallback` below is rebuilt every render too — and, worse, `query` gets a
   * new identity, which changes TanStack Query's cache key and refires the
   * search on every keystroke elsewhere on the page.
   */
  const search = params.toString();

  const filters: FilterState = React.useMemo(
    () => ({
      q: params.get('q') ?? '',
      category: params.get('category') ?? '',
      mode: asMode(params.get('mode')),
      tags: params.getAll('tags'),
      sort: asSort(params.get('sort')),
      closingSoon: params.get('closingSoon') === 'true',
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [search],
  );

  const page = asPage(params.get('page'));

  const query: Partial<JobQuery> = React.useMemo(
    () => ({
      ...(filters.q ? { q: filters.q } : {}),
      ...(filters.category ? { category: filters.category } : {}),
      ...(filters.mode ? { mode: filters.mode as JobMode } : {}),
      ...(filters.tags.length > 0 ? { tags: filters.tags } : {}),
      ...(filters.closingSoon ? { closingSoon: true } : {}),
      sort: filters.sort as JobSort,
      page,
      limit: 12,
    }),
    [filters, page],
  );

  const { data, isLoading, isError, refetch, isPlaceholderData } = useJobs(query);

  const updateFilters = React.useCallback(
    (next: Partial<FilterState>) => {
      const merged = { ...filters, ...next };

      // Any filter change resets to page 1. Staying on page 4 of a search that
      // now has two results would show an empty grid and look broken.
      const qs = toSearchParams({
        q: merged.q,
        category: merged.category,
        mode: merged.mode,
        tags: merged.tags,
        closingSoon: merged.closingSoon,
        sort: merged.sort === 'newest' ? '' : merged.sort,
      });

      router.push(qs ? `/opportunities?${qs}` : '/opportunities', { scroll: false });
    },
    [filters, router],
  );

  const goToPage = (next: number) => {
    const qs = toSearchParams({ ...query, page: next === 1 ? '' : next, limit: '' });
    router.push(qs ? `/opportunities?${qs}` : '/opportunities');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const reset = () => router.push('/opportunities');

  const jobs = data?.items ?? [];
  const pagination = data?.pagination;

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <PageHeader
        title="Opportunities"
        description="Every placement, internship, hackathon, certification and event — in one searchable place."
      />

      <div className="mb-8">
        <JobFilters
          value={filters}
          onChange={updateFilters}
          onReset={reset}
          total={pagination?.total}
        />
      </div>

      {isError ? (
        <ErrorState
          title="Could not load opportunities"
          message="The server did not respond. It may be waking up — try again in a moment."
          onRetry={() => void refetch()}
        />
      ) : isLoading ? (
        <JobGridSkeleton count={9} />
      ) : jobs.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="No opportunities match those filters"
          description="Try removing a filter, or broadening your search terms."
          action={
            <Button variant="outline" onClick={reset}>
              Clear all filters
            </Button>
          }
        />
      ) : (
        <>
          {/* Dim while a new page loads, so it is obvious the content is stale
              without collapsing the layout into a skeleton and losing scroll. */}
          <div
            className={
              isPlaceholderData
                ? 'grid gap-4 opacity-60 transition-opacity sm:grid-cols-2 lg:grid-cols-3'
                : 'grid gap-4 transition-opacity sm:grid-cols-2 lg:grid-cols-3'
            }
          >
            {jobs.map((job) => (
              <JobCard key={job.id} job={job} isAuthenticated={Boolean(user)} />
            ))}
          </div>

          {pagination && pagination.totalPages > 1 ? (
            <nav
              className="mt-10 flex items-center justify-center gap-2"
              aria-label="Pagination"
            >
              <Button
                variant="outline"
                size="sm"
                disabled={!pagination.hasPrev}
                onClick={() => goToPage(page - 1)}
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
                onClick={() => goToPage(page + 1)}
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
