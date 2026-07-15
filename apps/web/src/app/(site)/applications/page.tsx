'use client';

import {
  APPLICATION_STATUSES,
  APPLICATION_STATUS_LABELS,
  type Application,
  type ApplicationStatus,
} from '@cch/shared';
import { ExternalLink, MoreVertical, SendHorizonal, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsList,
  TabsTrigger,
} from '@/components/ui/primitives';
import { TableSkeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState, PageHeader } from '@/components/ui/states';
import {
  useApplications,
  useDeleteApplication,
  useUpdateApplication,
} from '@/hooks/use-jobs';
import { formatDate, getDeadlineInfo } from '@/lib/utils';

const STATUS_VARIANT: Record<
  ApplicationStatus,
  'default' | 'secondary' | 'success' | 'destructive' | 'muted'
> = {
  applied: 'default',
  interviewing: 'secondary',
  offered: 'success',
  rejected: 'destructive',
  withdrawn: 'muted',
};

/** Suspense boundary: `useSearchParams()` cannot be prerendered without one. */
export default function ApplicationsPage() {
  return (
    <React.Suspense
      fallback={
        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
          <PageHeader
            title="Applications"
            description="Everything you have applied to, and where each one stands."
          />
          <TableSkeleton rows={5} cols={4} />
        </div>
      }
    >
      <ApplicationsContent />
    </React.Suspense>
  );
}

function ApplicationsContent() {
  const router = useRouter();
  const params = useSearchParams();

  // Narrow the URL against the real enum rather than trusting it — `?status=x`
  // would otherwise be forwarded to the API and rejected with a 400 the user
  // cannot act on.
  const raw = params.get('status');
  const status: ApplicationStatus | 'all' = APPLICATION_STATUSES.includes(
    raw as ApplicationStatus,
  )
    ? (raw as ApplicationStatus)
    : 'all';

  const { data, isLoading, isError, refetch } = useApplications(
    status === 'all' ? {} : { status },
  );

  const [editing, setEditing] = React.useState<Application | null>(null);

  const applications = data?.items ?? [];

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <PageHeader
        title="Applications"
        description="Everything you have applied to, and where each one stands."
      />

      <Tabs
        value={status}
        onValueChange={(v) => router.push(v === 'all' ? '/applications' : `/applications?status=${v}`)}
        className="mb-6"
      >
        <TabsList className="w-full justify-start overflow-x-auto sm:w-auto">
          <TabsTrigger value="all">All</TabsTrigger>
          {APPLICATION_STATUSES.map((s) => (
            <TabsTrigger key={s} value={s}>
              {APPLICATION_STATUS_LABELS[s]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : isLoading ? (
        <TableSkeleton rows={5} cols={4} />
      ) : applications.length === 0 ? (
        <EmptyState
          icon={SendHorizonal}
          title={status === 'all' ? 'No applications yet' : `Nothing at "${APPLICATION_STATUS_LABELS[status as ApplicationStatus] ?? status}"`}
          description={
            status === 'all'
              ? 'When you apply to an opportunity, hit "Mark as applied" and it will be tracked here — so you never have to wonder again whether you already applied.'
              : 'Try a different status filter.'
          }
          action={
            <Button asChild>
              <Link href="/opportunities">Browse opportunities</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {applications.map((app) => (
            <ApplicationRow key={app.id} application={app} onEdit={() => setEditing(app)} />
          ))}
        </div>
      )}

      <EditApplicationDialog
        application={editing}
        open={editing !== null}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}

function ApplicationRow({
  application,
  onEdit,
}: {
  application: Application;
  onEdit: () => void;
}) {
  const remove = useDeleteApplication();
  const deadline = getDeadlineInfo(application.job.deadline);

  return (
    <Card className="p-4">
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-sm font-semibold text-muted-foreground">
          {application.job.company.name.charAt(0)}
        </div>

        <div className="min-w-0 flex-1">
          <Link
            href={`/opportunities/${application.job.slug}`}
            className="font-medium hover:text-primary hover:underline"
          >
            {application.job.role}
          </Link>

          <p className="text-sm text-muted-foreground">{application.job.company.name}</p>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant={STATUS_VARIANT[application.status]}>
              {APPLICATION_STATUS_LABELS[application.status]}
            </Badge>

            <span className="text-xs text-muted-foreground">
              Applied {formatDate(application.appliedAt)}
            </span>

            {deadline.urgency !== 'expired' && deadline.urgency !== 'none' ? (
              <span className="text-xs text-muted-foreground">· Closes {deadline.label}</span>
            ) : null}
          </div>

          {application.notes ? (
            <p className="mt-2 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              {application.notes}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Button variant="ghost" size="icon" asChild>
            <a
              href={application.job.applicationLink}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open the application link"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Application actions">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>Update status</DropdownMenuItem>
              <DropdownMenuItem
                destructive
                onClick={() => remove.mutate(application.id)}
                disabled={remove.isPending}
              >
                <Trash2 /> Remove
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </Card>
  );
}

function EditApplicationDialog({
  application,
  open,
  onClose,
}: {
  application: Application | null;
  open: boolean;
  onClose: () => void;
}) {
  const update = useUpdateApplication();

  const [status, setStatus] = React.useState<ApplicationStatus>('applied');
  const [notes, setNotes] = React.useState('');

  // Re-seed the form whenever a different application is opened. Without this,
  // opening a second application would show the first one's notes.
  React.useEffect(() => {
    if (application) {
      setStatus(application.status);
      setNotes(application.notes ?? '');
    }
  }, [application]);

  if (!application) return null;

  const submit = () => {
    update.mutate(
      { id: application.id, status, notes: notes || null },
      { onSuccess: onClose },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Update application</DialogTitle>
          <DialogDescription>
            {application.job.role} at {application.job.company.name}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as ApplicationStatus)}>
              <SelectTrigger id="status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {APPLICATION_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {APPLICATION_STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Interview on the 14th, ask about the team structure…"
              rows={4}
              maxLength={2000}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={update.isPending}>
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
