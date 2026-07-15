'use client';

import { Building2, Search } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState, PageHeader } from '@/components/ui/states';
import { useCompanies } from '@/hooks/use-jobs';

/**
 * Companies a student can browse.
 *
 * Each card links to the opportunities page pre-filtered to that company, so this
 * is a discovery entry point rather than a second, parallel place opportunities
 * live — there is exactly one list of opportunities, and it already enforces the
 * department/year eligibility rules. `jobCount` reflects only PUBLISHED roles, so
 * the numbers here match what the student will actually find when they click
 * through.
 */
export default function CompaniesPage() {
  const { data, isLoading, isError, refetch } = useCompanies();
  const [q, setQ] = React.useState('');

  const companies = data?.items ?? [];

  // Client-side filter: the full list is capped at 100 and already in memory, so
  // a round trip per keystroke would be pure waste.
  const filtered = React.useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return companies;
    return companies.filter((c) => c.name.toLowerCase().includes(term));
  }, [companies, q]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <PageHeader
        title="Companies"
        description="Every organisation recruiting through the placement cell. Open one to see the roles you are eligible for."
      />

      <div className="relative mb-6 max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search companies…"
          className="pl-9"
          aria-label="Search companies"
        />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={q ? 'No companies match that search' : 'No companies yet'}
          description={
            q
              ? 'Try a different name.'
              : 'When the placement cell adds companies, they will appear here.'
          }
        />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {filtered.map((company) => (
            <Link
              key={company.id}
              href={`/opportunities?company=${company.slug}`}
              className="group focus-visible:outline-none"
            >
              <Card
                interactive
                className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center"
              >
                {company.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={company.logoUrl}
                    alt=""
                    className="h-12 w-12 rounded-lg border border-border object-contain p-1"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-lg font-semibold text-primary">
                    {company.name.charAt(0)}
                  </div>
                )}

                <div>
                  <p className="font-medium leading-tight group-hover:text-primary">
                    {company.name}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {company.jobCount ?? 0}{' '}
                    {(company.jobCount ?? 0) === 1 ? 'opening' : 'openings'}
                  </p>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
