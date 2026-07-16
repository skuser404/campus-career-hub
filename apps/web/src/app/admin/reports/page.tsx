'use client';

import { REPORT_STATUS_LABELS, type Report, type ReportStatus } from '@cch/shared';
import { Check, Copy, Inbox, Sparkles, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/primitives';
import { TableSkeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState, PageHeader } from '@/components/ui/states';
import { useAdminReports, useReviewReport } from '@/hooks/use-reports';
import { formatRelative } from '@/lib/utils';

const ALL = '__all__';

/**
 * The report review queue.
 *
 * Pending reports first. "Use in new opportunity" carries the pasted message
 * into the New Opportunity form (via sessionStorage), where the same extractor
 * that powers the paste box fills the fields — so publishing a reported message
 * is the same flow as any other, just pre-loaded.
 */
export default function AdminReportsPage() {
  const router = useRouter();
  const [status, setStatus] = React.useState<string>('pending');

  const { data, isLoading, isError, refetch } = useAdminReports({
    status: status === ALL ? undefined : (status as ReportStatus),
    page: 1,
    limit: 50,
  });
  const review = useReviewReport();

  const reports = data?.items ?? [];

  const publishFromReport = (report: Report) => {
    // Hand the message to the New Opportunity page, which reads and clears it.
    try {
      sessionStorage.setItem('cch:report-prefill', report.message);
    } catch {
      /* private mode — the admin can still paste manually */
    }
    review.mutate({ id: report.id, status: 'published' });
    router.push('/admin/jobs/new');
  };

  return (
    <div>
      <PageHeader
        title="Opportunity reports"
        description="Placement messages students say are missing. Review, then publish or dismiss."
        action={
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pending review</SelectItem>
              <SelectItem value="published">Published</SelectItem>
              <SelectItem value="dismissed">Dismissed</SelectItem>
              <SelectItem value={ALL}>All</SelectItem>
            </SelectContent>
          </Select>
        }
      />

      {isLoading ? (
        <TableSkeleton rows={5} cols={1} />
      ) : isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : reports.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={status === 'pending' ? 'Nothing to review' : 'No reports here'}
          description="When a student reports a missing opportunity, it shows up here for review."
        />
      ) : (
        <div className="space-y-4">
          {reports.map((r) => (
            <Card key={r.id}>
              <CardContent className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  {r.companyName ? <span className="font-medium">{r.companyName}</span> : null}
                  {r.department ? <Badge variant="secondary">{r.department.code}</Badge> : null}
                  <StatusBadge status={r.status} />
                  <span className="ml-auto text-xs text-muted-foreground">
                    {r.reporter?.fullName ?? 'Unknown'} · {formatRelative(r.createdAt)}
                  </span>
                </div>

                <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-muted/40 p-3 font-sans text-sm text-foreground">
                  {r.message}
                </pre>

                {r.status === 'pending' ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => publishFromReport(r)}>
                      <Sparkles className="h-4 w-4" />
                      Use in new opportunity
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        void navigator.clipboard?.writeText(r.message);
                        toast.success('Message copied');
                      }}
                    >
                      <Copy className="h-4 w-4" />
                      Copy
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => review.mutate({ id: r.id, status: 'dismissed' })}
                      disabled={review.isPending}
                    >
                      <X className="h-4 w-4" />
                      Dismiss
                    </Button>
                  </div>
                ) : (
                  <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Check className="h-3.5 w-3.5" />
                    {REPORT_STATUS_LABELS[r.status]}
                    {r.reviewedAt ? ` · ${formatRelative(r.reviewedAt)}` : ''}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: ReportStatus }) {
  const variant =
    status === 'pending' ? 'warning' : status === 'published' ? 'success' : 'muted';
  return <Badge variant={variant}>{REPORT_STATUS_LABELS[status]}</Badge>;
}
