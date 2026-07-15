'use client';

import type { MarkReadInput, Notification, NotificationQuery, UnreadCount } from '@cch/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError, api } from '@/lib/api';
import { toSearchParams } from '@/lib/utils';

export const notificationKeys = {
  all: ['notifications'] as const,
  list: (q: Partial<NotificationQuery>) => ['notifications', 'list', q] as const,
  unread: ['notifications', 'unread'] as const,
};

/**
 * The unread badge in the navbar.
 *
 * Polled every 60 seconds. Not every 5 — a placement posting is not a chat
 * message, and hammering the API from 1,400 tabs to shave 55 seconds off the
 * arrival of a badge is a bad trade.
 *
 * `refetchOnWindowFocus` is the more useful signal anyway: a student coming back
 * to the tab gets a fresh count immediately.
 */
export function useUnreadCount() {
  return useQuery({
    queryKey: notificationKeys.unread,
    queryFn: () => api.get<UnreadCount>('/notifications/unread-count'),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
    // A signed-out user has no badge. Failing quietly beats an error toast on
    // the login screen.
    retry: false,
  });
}

export function useNotifications(query: Partial<NotificationQuery> = {}) {
  return useQuery({
    queryKey: notificationKeys.list(query),
    queryFn: () => api.getPaginated<Notification>(`/notifications?${toSearchParams(query)}`),
    placeholderData: (prev) => prev,
  });
}

export function useMarkRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: MarkReadInput) => api.post<{ marked: number }>('/notifications/read', input),

    async onMutate(input) {
      await queryClient.cancelQueries({ queryKey: notificationKeys.all });
      const snapshot = queryClient.getQueriesData({ queryKey: notificationKeys.all });

      // Optimistic: the badge should drop the instant the user opens the page,
      // not after a round trip. A stale badge that still says "3" while the
      // student is looking at three read notifications reads as broken.
      queryClient.setQueryData<UnreadCount>(notificationKeys.unread, (old) => {
        if (!old) return old;
        const cleared = input.ids?.length ?? old.unread;
        return { unread: Math.max(0, old.unread - cleared) };
      });

      return { snapshot };
    },

    onError(error, _vars, context) {
      for (const [key, data] of context?.snapshot ?? []) {
        queryClient.setQueryData(key, data);
      }
      toast.error(error instanceof ApiError ? error.message : 'Could not update notifications');
    },

    onSettled() {
      void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}

export function useDeleteNotification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/notifications/${id}`),

    onSettled() {
      void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },

    onError(error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not remove that notification');
    },
  });
}
