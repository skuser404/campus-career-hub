'use client';

import type {
  Application,
  ApplicationQuery,
  Category,
  Company,
  CreateApplicationInput,
  Job,
  JobQuery,
  StudentStats,
  Tag,
  UpdateApplicationInput,
} from '@cch/shared';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError, api, type Paginated } from '@/lib/api';
import { toSearchParams } from '@/lib/utils';

export const jobKeys = {
  all: ['jobs'] as const,
  list: (query: Partial<JobQuery>) => ['jobs', 'list', query] as const,
  detail: (slug: string) => ['jobs', 'detail', slug] as const,
  featured: ['jobs', 'featured'] as const,
  saved: (query?: object) => ['me', 'saved', query ?? {}] as const,
  applications: (query?: object) => ['me', 'applications', query ?? {}] as const,
  stats: ['me', 'stats'] as const,
  deadlines: ['me', 'deadlines'] as const,
  categories: ['categories'] as const,
  companies: ['companies'] as const,
  tags: ['tags'] as const,
};

// ── Reads ────────────────────────────────────────────────────────────────

export function useJobs(query: Partial<JobQuery>) {
  return useQuery({
    queryKey: jobKeys.list(query),
    queryFn: () => api.getPaginated<Job>(`/jobs?${toSearchParams(query)}`),
    // Keeps the previous page on screen while the next loads, so paging does not
    // blank the grid and bounce the scroll position to the top.
    placeholderData: (prev) => prev,
  });
}

export function useJob(slug: string) {
  return useQuery({
    queryKey: jobKeys.detail(slug),
    queryFn: () => api.get<Job>(`/jobs/${slug}`),
    enabled: Boolean(slug),
  });
}

export function useFeaturedJobs() {
  return useQuery({
    queryKey: jobKeys.featured,
    queryFn: () => api.get<{ latest: Job[]; closingSoon: Job[] }>('/jobs/featured'),
  });
}

export function useCategories() {
  return useQuery({
    queryKey: jobKeys.categories,
    queryFn: () => api.get<Category[]>('/categories'),
    // Categories change perhaps twice a year. Refetching them on every page
    // is pure waste.
    staleTime: 10 * 60_000,
  });
}

export function useCompanies() {
  return useQuery({
    queryKey: jobKeys.companies,
    queryFn: () => api.getPaginated<Company>('/companies?limit=100'),
    staleTime: 10 * 60_000,
  });
}

export function useTags() {
  return useQuery({
    queryKey: jobKeys.tags,
    queryFn: () => api.get<Tag[]>('/tags'),
    staleTime: 10 * 60_000,
  });
}

export function useStudentStats() {
  return useQuery({
    queryKey: jobKeys.stats,
    queryFn: () => api.get<StudentStats>('/me/stats'),
  });
}

export function useUpcomingDeadlines() {
  return useQuery({
    queryKey: jobKeys.deadlines,
    queryFn: () => api.get<Job[]>('/me/deadlines'),
  });
}

export function useSavedJobs(query: { page?: number; sort?: string } = {}) {
  return useQuery({
    queryKey: jobKeys.saved(query),
    queryFn: () => api.getPaginated<Job>(`/me/saved?${toSearchParams(query)}`),
    placeholderData: (prev) => prev,
  });
}

export function useApplications(query: Partial<ApplicationQuery> = {}) {
  return useQuery({
    queryKey: jobKeys.applications(query),
    queryFn: () => api.getPaginated<Application>(`/me/applications?${toSearchParams(query)}`),
    placeholderData: (prev) => prev,
  });
}

// ── Optimistic helpers ───────────────────────────────────────────────────

type JobPage = Paginated<Job>;

/**
 * Flip a flag on one job everywhere it appears in the cache — search results,
 * the detail page, the dashboard rails — without knowing which queries exist.
 *
 * The alternative is invalidating and refetching, which means the heart icon
 * does not fill until the server answers. On a slow campus connection that is a
 * second of the user wondering whether their tap registered.
 */
function patchJobInCache(
  queryClient: ReturnType<typeof useQueryClient>,
  jobId: string,
  patch: Partial<Job>,
) {
  queryClient.setQueriesData<JobPage | Job | InfiniteData<JobPage> | undefined>(
    { queryKey: jobKeys.all },
    (old) => {
      if (!old) return old;

      // A single job (detail page).
      if ('id' in old && old.id === jobId) {
        return { ...old, ...patch };
      }

      // A page of jobs.
      if ('items' in old && Array.isArray(old.items)) {
        return {
          ...old,
          items: old.items.map((j) => (j.id === jobId ? { ...j, ...patch } : j)),
        };
      }

      return old;
    },
  );
}

// ── Save / unsave ────────────────────────────────────────────────────────

export function useToggleSave() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ jobId, isSaved }: { jobId: string; isSaved: boolean }) =>
      isSaved ? api.delete<void>(`/me/saved/${jobId}`) : api.post<void>(`/me/saved/${jobId}`),

    async onMutate({ jobId, isSaved }) {
      // Cancel in-flight refetches, or one could land mid-mutation and overwrite
      // the optimistic value with stale server data.
      await queryClient.cancelQueries({ queryKey: jobKeys.all });

      const snapshot = queryClient.getQueriesData({ queryKey: jobKeys.all });
      patchJobInCache(queryClient, jobId, { isSaved: !isSaved });

      return { snapshot };
    },

    onError(error, _vars, context) {
      // Roll back to exactly what was there before. Without the snapshot we
      // would have to guess at the previous state and could get it wrong.
      for (const [key, data] of context?.snapshot ?? []) {
        queryClient.setQueryData(key, data);
      }
      toast.error(error instanceof ApiError ? error.message : 'Could not update saved jobs');
    },

    onSuccess(_data, { isSaved }) {
      toast.success(isSaved ? 'Removed from saved' : 'Saved');
    },

    onSettled() {
      // Reconcile with the server, and refresh the counters the mutation moved.
      void queryClient.invalidateQueries({ queryKey: jobKeys.saved() });
      void queryClient.invalidateQueries({ queryKey: jobKeys.stats });
      void queryClient.invalidateQueries({ queryKey: jobKeys.deadlines });
    },
  });
}

// ── Apply ────────────────────────────────────────────────────────────────

export function useMarkApplied() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateApplicationInput) =>
      api.post<Application>('/me/applications', input),

    async onMutate({ jobId }) {
      await queryClient.cancelQueries({ queryKey: jobKeys.all });
      const snapshot = queryClient.getQueriesData({ queryKey: jobKeys.all });
      patchJobInCache(queryClient, jobId, { isApplied: true });
      return { snapshot };
    },

    onError(error, _vars, context) {
      for (const [key, data] of context?.snapshot ?? []) {
        queryClient.setQueryData(key, data);
      }
      toast.error(error instanceof ApiError ? error.message : 'Could not record your application');
    },

    onSuccess() {
      toast.success('Marked as applied. It will show up in your application history.');
    },

    onSettled() {
      void queryClient.invalidateQueries({ queryKey: jobKeys.applications() });
      void queryClient.invalidateQueries({ queryKey: jobKeys.stats });
      void queryClient.invalidateQueries({ queryKey: jobKeys.deadlines });
    },
  });
}

export function useUpdateApplication() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...input }: UpdateApplicationInput & { id: string }) =>
      api.patch<Application>(`/me/applications/${id}`, input),

    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: jobKeys.applications() });
      void queryClient.invalidateQueries({ queryKey: jobKeys.stats });
      toast.success('Application updated');
    },

    onError(error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not update the application');
    },
  });
}

export function useDeleteApplication() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/me/applications/${id}`),

    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: jobKeys.all });
      toast.success('Application removed');
    },

    onError(error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not remove the application');
    },
  });
}

/** Fire-and-forget view tracking. A failure here must never disturb the page. */
export function recordJobView(jobId: string): void {
  void api.post(`/jobs/${jobId}/view`).catch(() => {
    // Deliberately silent. An analytics counter is not worth a toast.
  });
}
