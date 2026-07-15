'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { JobForm } from '@/components/admin/job-form';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState, PageHeader } from '@/components/ui/states';
import { useAdminJob } from '@/hooks/use-admin';

export default function EditJobPage() {
  const { id } = useParams<{ id: string }>();
  const { data: job, isLoading, isError, refetch } = useAdminJob(id);

  if (isError) {
    return (
      <div>
        <ErrorState
          title="Could not load this opportunity"
          message="It may have been deleted."
          onRetry={() => void refetch()}
        />
      </div>
    );
  }

  return (
    <div>
      <Button variant="ghost" size="sm" className="mb-4 -ml-2" asChild>
        <Link href="/admin/jobs">
          <ArrowLeft className="h-4 w-4" />
          Back to opportunities
        </Link>
      </Button>

      {isLoading || !job ? (
        <>
          <Skeleton className="mb-8 h-9 w-64" />
          <div className="grid gap-6 lg:grid-cols-3">
            <Skeleton className="h-[32rem] lg:col-span-2" />
            <Skeleton className="h-96" />
          </div>
        </>
      ) : (
        <>
          <PageHeader
            title="Edit opportunity"
            description={`${job.role} at ${job.company.name}`}
          />

          {/*
           * `key` forces a fresh form when the id changes. React Hook Form reads
           * defaultValues once on mount — without this, navigating from editing
           * job A to job B would remount nothing and leave A's values in the fields.
           */}
          <JobForm key={job.id} job={job} />
        </>
      )}
    </div>
  );
}
