'use client';

import {
  ANNOUNCEMENT_PRIORITIES,
  announcementInputSchema,
  type Announcement,
  type AnnouncementInput,
  type AnnouncementPriority,
} from '@cch/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { Megaphone, MoreVertical, Pencil, Plus, Trash2 } from 'lucide-react';
import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
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
  Switch,
} from '@/components/ui/primitives';
import { TableSkeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState, PageHeader } from '@/components/ui/states';
import {
  useAdminAnnouncements,
  useDeleteAnnouncement,
  useSaveAnnouncement,
} from '@/hooks/use-admin';
import { formatDate } from '@/lib/utils';

const PRIORITY_VARIANT: Record<AnnouncementPriority, 'muted' | 'secondary' | 'warning' | 'destructive'> = {
  low: 'muted',
  normal: 'secondary',
  high: 'warning',
  urgent: 'destructive',
};

/** A Date → the `YYYY-MM-DDTHH:mm` that `datetime-local` demands. */
const toLocalInput = (d: Date | string | null): string =>
  d ? new Date(d).toISOString().slice(0, 16) : '';

export default function AdminAnnouncementsPage() {
  const { data, isLoading, isError, refetch } = useAdminAnnouncements();
  const remove = useDeleteAnnouncement();

  const [editing, setEditing] = React.useState<Announcement | null>(null);
  const [creating, setCreating] = React.useState(false);

  const announcements = data?.items ?? [];

  return (
    <div>
      <PageHeader
        title="Announcements"
        description="Broadcast to every student. Schedule a window and it switches itself on and off."
        action={
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" />
            New announcement
          </Button>
        }
      />

      {isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : isLoading ? (
        <TableSkeleton rows={4} cols={3} />
      ) : announcements.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No announcements"
          description="Announcements appear on the landing page and on every student's dashboard."
          action={
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" />
              New announcement
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {announcements.map((a) => (
            <div key={a.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{a.title}</p>
                    <Badge variant={PRIORITY_VARIANT[a.priority]}>{a.priority}</Badge>
                    {!a.isActive ? <Badge variant="muted">Inactive</Badge> : null}
                  </div>

                  <p className="mt-1.5 text-sm text-muted-foreground">{a.body}</p>

                  {a.startsAt || a.endsAt ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {a.startsAt ? `From ${formatDate(a.startsAt)}` : 'From now'}
                      {a.endsAt ? ` until ${formatDate(a.endsAt)}` : ''}
                    </p>
                  ) : null}
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label={`Actions for ${a.title}`}>
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>

                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setEditing(a)}>
                      <Pencil /> Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      destructive
                      onClick={() => remove.mutate(a.id)}
                      disabled={remove.isPending}
                    >
                      <Trash2 /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))}
        </div>
      )}

      <AnnouncementDialog
        key={editing?.id ?? 'new'}
        announcement={editing}
        open={creating || editing !== null}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />
    </div>
  );
}

function AnnouncementDialog({
  announcement,
  open,
  onClose,
}: {
  announcement: Announcement | null;
  open: boolean;
  onClose: () => void;
}) {
  const save = useSaveAnnouncement();

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<AnnouncementInput>({
    resolver: zodResolver(announcementInputSchema),
    defaultValues: announcement
      ? {
          title: announcement.title,
          body: announcement.body,
          priority: announcement.priority,
          isActive: announcement.isActive,
          startsAt: toLocalInput(announcement.startsAt) as unknown as Date,
          endsAt: toLocalInput(announcement.endsAt) as unknown as Date,
        }
      : { title: '', body: '', priority: 'normal', isActive: true },
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{announcement ? 'Edit announcement' : 'New announcement'}</DialogTitle>
          <DialogDescription>
            Leave the dates blank to show it immediately and indefinitely.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit((data) =>
            save.mutate(
              { ...data, ...(announcement ? { id: announcement.id } : {}) },
              { onSuccess: onClose },
            ),
          )}
          className="space-y-4"
          noValidate
        >
          <div className="space-y-2">
            <Label htmlFor="title">
              Title <span className="text-destructive">*</span>
            </Label>
            <Input id="title" error={Boolean(errors.title)} {...register('title')} />
            {errors.title ? (
              <p role="alert" className="text-xs text-destructive">
                {errors.title.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="body">
              Message <span className="text-destructive">*</span>
            </Label>
            <Textarea id="body" rows={4} error={Boolean(errors.body)} {...register('body')} />
            {errors.body ? (
              <p role="alert" className="text-xs text-destructive">
                {errors.body.message}
              </p>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="priority">Priority</Label>
              <Controller
                name="priority"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="priority">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ANNOUNCEMENT_PRIORITIES.map((p) => (
                        <SelectItem key={p} value={p}>
                          {p.charAt(0).toUpperCase() + p.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-2">
              <Label>Active</Label>
              <div className="flex h-9 items-center">
                <Controller
                  name="isActive"
                  control={control}
                  render={({ field }) => (
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      aria-label="Active"
                    />
                  )}
                />
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="startsAt">Starts</Label>
              <Input id="startsAt" type="datetime-local" {...register('startsAt')} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="endsAt">Ends</Label>
              <Input
                id="endsAt"
                type="datetime-local"
                error={Boolean(errors.endsAt)}
                {...register('endsAt')}
              />
              {errors.endsAt ? (
                <p role="alert" className="text-xs text-destructive">
                  {errors.endsAt.message}
                </p>
              ) : null}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending}>
              {announcement ? 'Save changes' : 'Publish'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
