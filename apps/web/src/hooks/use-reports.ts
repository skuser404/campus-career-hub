'use client';

import type { Department, Report, ReportInput, ReportListQuery } from '@cch/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError, api } from '@/lib/api';
import { toSearchParams } from '@/lib/utils';

export const reportKeys = {
  all: ['reports'] as const,
  list: (q: Partial<ReportListQuery>) => ['reports', 'list', q] as const,
};

/** Departments, for the report dialog's dropdown. Available to any signed-in user. */
export function useDepartments() {
  return useQuery({
    queryKey: ['departments'],
    queryFn: () => api.get<Department[]>('/departments'),
    staleTime: 10 * 60_000,
  });
}

/** Student submits a missing-opportunity report. */
export function useSubmitReport() {
  return useMutation({
    mutationFn: (input: ReportInput) => api.post<{ id: string }>('/me/reports', input),
    onSuccess() {
      toast.success('Thanks — sent to the placement office for review.');
    },
    onError(error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not send your report');
    },
  });
}

// ── Admin ──────────────────────────────────────────────────────────────────

export function useAdminReports(query: Partial<ReportListQuery> = {}) {
  return useQuery({
    queryKey: reportKeys.list(query),
    queryFn: () => api.getPaginated<Report>(`/admin/reports?${toSearchParams(query)}`),
    placeholderData: (prev) => prev,
  });
}

export function useReviewReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'published' | 'dismissed' }) =>
      api.patch<{ status: string }>(`/admin/reports/${id}`, { status }),
    onSuccess(_data, vars) {
      void qc.invalidateQueries({ queryKey: reportKeys.all });
      void qc.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
      toast.success(vars.status === 'published' ? 'Marked as published' : 'Report dismissed');
    },
    onError(error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not update the report');
    },
  });
}
