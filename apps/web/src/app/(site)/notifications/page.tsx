'use client';

import { NOTIFICATION_LABELS, type Notification } from '@cch/shared';
import { Bell, BellOff, CheckCheck, Trash2 } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState, PageHeader } from '@/components/ui/states';
import {
  useDeleteNotification,
  useMarkRead,
  useNotifications,
} from '@/hooks/use-notifications';
import { cn, formatRelative } from '@/lib/utils';

export default function NotificationsPage() {
  const { data, isLoading, isError, refetch } = useNotifications({ page: 1, limit: 30 });
  const markRead = useMarkRead();
  const remove = useDeleteNotification();

  const items = data?.items ?? [];
  const unread = items.filter((n) => !n.isRead);

  /**
   * Mark everything read when the page opens.
   *
   * The student is looking at them — that IS reading them. Making them click a
   * second button to confirm they read what is on their screen would be busywork,
   * and a badge that stays lit while they stare at the list reads as broken.
   *
   * The ref guard stops React 18's double-invoked effect from firing it twice.
   */
  const marked = React.useRef(false);

  React.useEffect(() => {
    if (marked.current || isLoading || unread.length === 0) return;
    marked.current = true;
    markRead.mutate({});
  }, [isLoading, unread.length, markRead]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
      <PageHeader
        title="Notifications"
        description="New opportunities you are eligible for, and updates from the placement office."
        action={
          unread.length > 0 ? (
            <Button variant="outline" size="sm" onClick={() => markRead.mutate({})}>
              <CheckCheck className="h-4 w-4" />
              Mark all read
            </Button>
          ) : undefined
        }
      />

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={BellOff}
          title="Nothing yet"
          description="When the placement office posts an opportunity your department and year are eligible for, it will show up here."
          action={
            <Button asChild>
              <Link href="/opportunities">Browse opportunities</Link>
            </Button>
          }
        />
      ) : (
        <ul className="space-y-2">
          {items.map((n) => (
            <NotificationRow key={n.id} notification={n} onDelete={() => remove.mutate(n.id)} />
          ))}
        </ul>
      )}
    </div>
  );
}

function NotificationRow({
  notification: n,
  onDelete,
}: {
  notification: Notification;
  onDelete: () => void;
}) {
  const body = (
    <>
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
            n.isRead ? 'bg-muted' : 'bg-primary/10',
          )}
        >
          <Bell
            className={cn('h-4 w-4', n.isRead ? 'text-muted-foreground' : 'text-primary')}
            aria-hidden="true"
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className={cn('text-sm', n.isRead ? 'font-medium' : 'font-semibold')}>{n.title}</p>
            <Badge variant="muted">{NOTIFICATION_LABELS[n.type]}</Badge>
            {!n.isRead ? (
              <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-label="Unread" />
            ) : null}
          </div>

          {n.body ? (
            <p className="mt-0.5 text-sm text-muted-foreground">{n.body}</p>
          ) : null}

          <p className="mt-1 text-xs text-muted-foreground">{formatRelative(n.createdAt)}</p>
        </div>
      </div>
    </>
  );

  return (
    <li
      className={cn(
        'group relative rounded-xl border p-4 transition-colors',
        n.isRead ? 'border-border bg-card' : 'border-primary/25 bg-primary/[0.03]',
      )}
    >
      {/* The link is only rendered when there IS one. A notification without a
          destination must not look clickable. */}
      {n.link ? (
        <Link
          href={n.link}
          className="absolute inset-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={n.title}
        />
      ) : null}

      <div className="pointer-events-none relative">{body}</div>

      <Button
        variant="ghost"
        size="icon"
        onClick={onDelete}
        aria-label={`Dismiss: ${n.title}`}
        className="absolute right-2 top-2 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </li>
  );
}
