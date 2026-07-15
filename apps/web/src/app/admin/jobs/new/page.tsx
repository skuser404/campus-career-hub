'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { JobForm } from '@/components/admin/job-form';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/states';

export default function NewJobPage() {
  return (
    <div>
      <Button variant="ghost" size="sm" className="mb-4 -ml-2" asChild>
        <Link href="/admin/jobs">
          <ArrowLeft className="h-4 w-4" />
          Back to opportunities
        </Link>
      </Button>

      <PageHeader
        title="New opportunity"
        description="It stays invisible to students until you set the status to Published."
      />

      <JobForm />
    </div>
  );
}
