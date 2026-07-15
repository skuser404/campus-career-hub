'use client';

import { JOB_STATUSES, JOB_STATUS_LABELS, type JobStatus } from '@cch/shared';
import { Briefcase, ExternalLink, MoreVertical, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/primitives';
import { TableSkeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState, PageHeader } from '@/components/ui/states';
import { useAdminJobs, useBulkJobAction, useDeleteJob } from '@/hooks/use-admin';
import { formatDate, getDeadlineInfo } from '@/lib/utils';

const STATUS_VARIANT: Record<JobStatus, 'success' | 'muted' | 'secondary' | 'destructive'> = {
  published: 'success',
  draft: 'muted',
  closed: 'secondary',
  archived: 'destructive',
};

export default function AdminJobsPage() {
  const [search, setSearch] = React.useState('');
  const [debounced, setDebounced] = React.useState('');
  const [status, setStatus] = React.useState<JobStatus | 'all'>('all');
  const [page, setPage] = React.useState(1);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = React.useState<{ id: string; role: string } | null>(null);

  React.useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search);
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading, isError, refetch } = useAdminJobs({
    ...(debounced ? { q: debounced } : {}),
    ...(status !== 'all' ? { status } : {}),
    page,
    limit: 20,
  });

  const bulk = useBulkJobAction();
  const remove = useDeleteJob();

  const jobs = data?.items ?? [];
  const pagination = data?.pagination;

  // Selection is cleared whenever the underlying list changes. Keeping ids that
  // are no longer on screen would let a bulk action hit rows the admin can no
  // longer see — which is how people accidentally archive the wrong thing.
  React.useEffect(() => {
    setSelected(new Set());
  }, [debounced, status, page]);

  const allSelected = jobs.length > 0 && selected.size === jobs.length;

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(jobs.map((j) => j.id)));
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const runBulk = (action: 'publish' | 'close' | 'archive' | 'delete') => {
    bulk.mutate(
      { ids: [...selected], action },
      { onSuccess: () => setSelected(new Set()) },
    );
  };

  return (
    <div>
      <PageHeader
        title="Opportunities"
        description="Create, edit, publish and archive."
        action={
          <Button asChild>
            <Link href="/admin/jobs/new">
              <Plus className="h-4 w-4" />
              New opportunity
            </Link>
          </Button>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search opportunities…"
            className="pl-9"
            aria-label="Search opportunities"
          />
        </div>

        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v as JobStatus | 'all');
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-44" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {JOB_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {JOB_STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* The bulk bar only exists when something is selected. A permanently
          visible row of destructive buttons is an invitation to a mistake. */}
      {selected.size > 0 ? (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3">
          <span className="text-sm font-medium">
            {selected.size} selected
          </span>

          <div className="ml-auto flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => runBulk('publish')} disabled={bulk.isPending}>
              Publish
            </Button>
            <Button size="sm" variant="outline" onClick={() => runBulk('close')} disabled={bulk.isPending}>
              Close
            </Button>
            <Button size="sm" variant="outline" onClick={() => runBulk('archive')} disabled={bulk.isPending}>
              Archive
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => runBulk('delete')}
              disabled={bulk.isPending}
            >
              Delete
            </Button>
          </div>
        </div>
      ) : null}

      {isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : isLoading ? (
        <TableSkeleton rows={8} cols={5} />
      ) : jobs.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title={debounced || status !== 'all' ? 'No matches' : 'No opportunities yet'}
          description={
            debounced || status !== 'all'
              ? 'Try a different search or status filter.'
              : 'Create your first opportunity and students will see it the moment you publish.'
          }
          action={
            <Button asChild>
              <Link href="/admin/jobs/new">
                <Plus className="h-4 w-4" />
                New opportunity
              </Link>
            </Button>
          }
        />
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-border">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/50">
                  <tr>
                    <th className="w-10 p-3">
                      <Checkbox
                        checked={allSelected}
                        onCheckedChange={toggleAll}
                        aria-label="Select all on this page"
                      />
                    </th>
                    <th className="p-3 text-left font-medium">Role</th>
                    <th className="p-3 text-left font-medium">Company</th>
                    <th className="p-3 text-left font-medium">Status</th>
                    <th className="p-3 text-left font-medium">Deadline</th>
                    <th className="p-3 text-right font-medium">Views</th>
                    <th className="w-10 p-3" />
                  </tr>
                </thead>

                <tbody>
                  {jobs.map((job) => {
                    const deadline = getDeadlineInfo(job.deadline);
                    const isSelected = selected.has(job.id);

                    return (
                      <tr
                        key={job.id}
                        className="border-b border-border last:border-0 hover:bg-muted/30"
                        data-state={isSelected ? 'selected' : undefined}
                      >
                        <td className="p-3">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleOne(job.id)}
                            aria-label={`Select ${job.role}`}
                          />
                        </td>

                        <td className="max-w-xs p-3">
                          <Link
                            href={`/admin/jobs/${job.id}/edit`}
                            className="line-clamp-1 font-medium hover:text-primary hover:underline"
                          >
                            {job.role}
                          </Link>
                          <p className="text-xs text-muted-foreground">{job.category.name}</p>
                        </td>

                        <td className="p-3 text-muted-foreground">{job.company.name}</td>

                        <td className="p-3">
                          <Badge variant={STATUS_VARIANT[job.status]}>
                            {JOB_STATUS_LABELS[job.status]}
                          </Badge>
                        </td>

                        <td className="p-3">
                          {job.deadline ? (
                            <span
                              className={
                                deadline.urgency === 'urgent' || deadline.urgency === 'today'
                                  ? 'text-destructive'
                                  : 'text-muted-foreground'
                              }
                            >
                              {formatDate(job.deadline)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>

                        <td className="p-3 text-right tabular-nums text-muted-foreground">
                          {job.viewsCount}
                        </td>

                        <td className="p-3">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" aria-label={`Actions for ${job.role}`}>
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>

                            <DropdownMenuContent align="end">
                              <DropdownMenuItem asChild>
                                <Link href={`/admin/jobs/${job.id}/edit`}>
                                  <Pencil /> Edit
                                </Link>
                              </DropdownMenuItem>

                              <DropdownMenuItem asChild>
                                <Link href={`/opportunities/${job.slug}`} target="_blank">
                                  <ExternalLink /> View public page
                                </Link>
                              </DropdownMenuItem>

                              <DropdownMenuSeparator />

                              <DropdownMenuItem
                                destructive
                                onClick={() => setConfirmDelete({ id: job.id, role: job.role })}
                              >
                                <Trash2 /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {pagination && pagination.totalPages > 1 ? (
            <nav className="mt-6 flex items-center justify-between" aria-label="Pagination">
              <p className="text-sm text-muted-foreground">
                {pagination.total} opportunit{pagination.total === 1 ? 'y' : 'ies'}
              </p>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!pagination.hasPrev}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </Button>

                <span className="text-sm text-muted-foreground">
                  {pagination.page} / {pagination.totalPages}
                </span>

                <Button
                  variant="outline"
                  size="sm"
                  disabled={!pagination.hasNext}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </nav>
          ) : null}
        </>
      )}

      {/* Destructive actions get a confirmation. Deleting an opportunity also
          deletes every student's application record for it — that is not
          something to trigger from a single stray click. */}
      <Dialog open={confirmDelete !== null} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this opportunity?</DialogTitle>
            <DialogDescription>
              <strong>{confirmDelete?.role}</strong> will be permanently removed, along with every
              student&apos;s saved bookmark and application record for it. This cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              loading={remove.isPending}
              onClick={() => {
                if (confirmDelete) {
                  remove.mutate(confirmDelete.id, { onSuccess: () => setConfirmDelete(null) });
                }
              }}
            >
              Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
