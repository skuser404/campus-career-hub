'use client';

import type {
  AdminDashboardStats,
  AdminJobQuery,
  AnalyticsOverview,
  Announcement,
  AnnouncementInput,
  Banner,
  BannerInput,
  BulkJobActionInput,
  Category,
  CategoryInput,
  Company,
  CompanyInput,
  Department,
  DepartmentInput,
  ImportResult,
  Job,
  JobInput,
  PublicUser,
  ResetPasswordResult,
  SiteSettings,
  StudentInput,
  StudentListQuery,
  Tag,
  UpdateJobInput,
  UpdateSiteSettingsInput,
  UpdateStudentInput,
  UploadSignatureResponse,
  UserRole,
} from '@cch/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { API_URL, ApiError, api } from '@/lib/api';
import { toSearchParams } from '@/lib/utils';

export const adminKeys = {
  all: ['admin'] as const,
  dashboard: ['admin', 'dashboard'] as const,
  analytics: (days: number) => ['admin', 'analytics', days] as const,
  jobs: (q: object) => ['admin', 'jobs', q] as const,
  job: (id: string) => ['admin', 'jobs', id] as const,
  students: (q: object) => ['admin', 'students', q] as const,
  departments: ['admin', 'departments'] as const,
  companies: ['admin', 'companies'] as const,
  categories: ['admin', 'categories'] as const,
  tags: ['admin', 'tags'] as const,
  announcements: ['admin', 'announcements'] as const,
  banners: ['admin', 'banners'] as const,
  settings: ['admin', 'settings'] as const,
};

const onErr = (fallback: string) => (error: unknown) =>
  toast.error(error instanceof ApiError ? error.message : fallback);

// ── Dashboard & analytics ────────────────────────────────────────────────

export function useAdminDashboard() {
  return useQuery({
    queryKey: adminKeys.dashboard,
    queryFn: () => api.get<AdminDashboardStats>('/admin/dashboard'),
  });
}

export function useAnalytics(days: number) {
  return useQuery({
    queryKey: adminKeys.analytics(days),
    queryFn: () => api.get<AnalyticsOverview>(`/admin/analytics/overview?days=${days}`),
  });
}

// ── Jobs ─────────────────────────────────────────────────────────────────

export function useAdminJobs(query: Partial<AdminJobQuery>) {
  return useQuery({
    queryKey: adminKeys.jobs(query),
    queryFn: () => api.getPaginated<Job>(`/admin/jobs?${toSearchParams(query)}`),
    placeholderData: (prev) => prev,
  });
}

export function useAdminJob(id: string | undefined) {
  return useQuery({
    queryKey: adminKeys.job(id ?? ''),
    queryFn: () => api.get<Job>(`/admin/jobs/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: JobInput) => api.post<Job>('/admin/jobs', input),
    onSuccess(job) {
      void qc.invalidateQueries({ queryKey: adminKeys.all });
      // The distinction matters: publishing fans a notification out to every
      // eligible student, and an admin should know that happened.
      toast.success(
        job.status === 'published'
          ? 'Published. Eligible students have been notified.'
          : 'Saved as a draft. Students cannot see it yet.',
      );
    },
    onError: onErr('Could not create that opportunity'),
  });
}

export function useUpdateJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateJobInput & { id: string }) =>
      api.patch<Job>(`/admin/jobs/${id}`, input),
    onSuccess() {
      void qc.invalidateQueries({ queryKey: adminKeys.all });
      toast.success('Opportunity updated');
    },
    onError: onErr('Could not update that opportunity'),
  });
}

export function useDeleteJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/admin/jobs/${id}`),
    onSuccess() {
      void qc.invalidateQueries({ queryKey: adminKeys.all });
      toast.success('Opportunity deleted');
    },
    onError: onErr('Could not delete that opportunity'),
  });
}

export function useBulkJobAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: BulkJobActionInput) =>
      api.post<{ affected: number }>('/admin/jobs/bulk', input),
    onSuccess(data) {
      void qc.invalidateQueries({ queryKey: adminKeys.all });
      toast.success(`${data.affected} opportunit${data.affected === 1 ? 'y' : 'ies'} updated`);
    },
    onError: onErr('Could not apply that action'),
  });
}

// ── Students ─────────────────────────────────────────────────────────────

export function useAdminStudents(query: Partial<StudentListQuery>) {
  return useQuery({
    queryKey: adminKeys.students(query),
    queryFn: () => api.getPaginated<PublicUser>(`/admin/students?${toSearchParams(query)}`),
    placeholderData: (prev) => prev,
  });
}

export function useCreateStudent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: StudentInput) => api.post<PublicUser>('/admin/students', input),
    onSuccess(user) {
      void qc.invalidateQueries({ queryKey: adminKeys.all });
      toast.success(`${user.fullName} added. Their password is their USN.`);
    },
    onError: onErr('Could not add that student'),
  });
}

export function useUpdateStudent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateStudentInput & { id: string }) =>
      api.patch<PublicUser>(`/admin/students/${id}`, input),
    onSuccess() {
      void qc.invalidateQueries({ queryKey: adminKeys.all });
      toast.success('Student updated');
    },
    onError: onErr('Could not update that student'),
  });
}

export function useResetStudentPassword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<ResetPasswordResult>(`/admin/students/${id}/reset-password`),
    onSuccess(data) {
      void qc.invalidateQueries({ queryKey: adminKeys.all });
      toast.success(`Password reset to ${data.usn}. They must change it at next sign-in.`);
    },
    onError: onErr('Could not reset that password'),
  });
}

export function useSetStudentStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.patch<PublicUser>(`/admin/students/${id}/status`, { isActive }),
    onSuccess(user) {
      void qc.invalidateQueries({ queryKey: adminKeys.all });
      toast.success(user.isActive ? 'Account enabled' : 'Account disabled and signed out');
    },
    onError: onErr('Could not change that account'),
  });
}

export function useSetStudentRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, role }: { id: string; role: UserRole }) =>
      api.patch<PublicUser>(`/admin/students/${id}/role`, { role }),
    onSuccess(user) {
      void qc.invalidateQueries({ queryKey: adminKeys.all });
      toast.success(`${user.fullName} is now ${user.role === 'admin' ? 'an admin' : 'a student'}`);
    },
    onError: onErr('Could not change that role'),
  });
}

export function useDeleteStudent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/admin/students/${id}`),
    onSuccess() {
      void qc.invalidateQueries({ queryKey: adminKeys.all });
      toast.success('Student deleted');
    },
    onError: onErr('Could not delete that student'),
  });
}

/**
 * The bulk import.
 *
 * Uses raw `fetch` rather than the JSON api client, because this is a multipart
 * upload. Setting `Content-Type` by hand would omit the multipart boundary and
 * the server would reject the body — so the header is deliberately left for the
 * browser to fill in.
 */
export function useImportStudents() {
  const qc = useQueryClient();

  return useMutation({
    async mutationFn({
      file,
      dryRun,
      updateExisting,
    }: {
      file: File;
      dryRun: boolean;
      updateExisting: boolean;
    }): Promise<ImportResult> {
      const form = new FormData();
      form.append('file', file);

      const qs = toSearchParams({ dryRun, updateExisting });

      const res = await fetch(`${API_URL}/admin/students/import?${qs}`, {
        method: 'POST',
        credentials: 'include',
        body: form,
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new ApiError(
          res.status,
          json.error?.code ?? 'INTERNAL_ERROR',
          json.error?.message ?? 'Import failed',
          json.error?.details,
        );
      }

      return json.data as ImportResult;
    },

    onSuccess(result) {
      // A dry run changed nothing — the UI renders the preview instead.
      if (result.dryRun) return;

      void qc.invalidateQueries({ queryKey: adminKeys.all });

      if (result.failed > 0) {
        toast.error(
          `${result.failed} row${result.failed === 1 ? '' : 's'} failed. Nothing was imported.`,
        );
      } else {
        toast.success(`Imported: ${result.created} created, ${result.updated} updated.`);
      }
    },

    onError: onErr('Could not import that file'),
  });
}

// ── Departments ──────────────────────────────────────────────────────────

export function useAdminDepartments() {
  return useQuery({
    queryKey: adminKeys.departments,
    queryFn: () => api.get<Department[]>('/admin/departments'),
  });
}

export function useCreateDepartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: DepartmentInput) => api.post<Department>('/admin/departments', input),
    onSuccess() {
      void qc.invalidateQueries({ queryKey: adminKeys.all });
      toast.success('Department created');
    },
    onError: onErr('Could not create that department'),
  });
}

export function useDeleteDepartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/admin/departments/${id}`),
    onSuccess() {
      void qc.invalidateQueries({ queryKey: adminKeys.all });
      toast.success('Department deleted');
    },
    onError: onErr('Could not delete that department'),
  });
}

// ── Companies / categories / tags ────────────────────────────────────────

export function useAdminCompanies(query: { q?: string } = {}) {
  return useQuery({
    queryKey: [...adminKeys.companies, query],
    queryFn: () =>
      api.getPaginated<Company>(`/admin/companies?${toSearchParams({ ...query, limit: 100 })}`),
    placeholderData: (prev) => prev,
  });
}

export function useCreateCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CompanyInput) => api.post<Company>('/admin/companies', input),
    onSuccess() {
      void qc.invalidateQueries({ queryKey: adminKeys.all });
      toast.success('Company added');
    },
    onError: onErr('Could not add that company'),
  });
}

/**
 * Upsert hooks.
 *
 * The admin CRUD pages use ONE dialog for both "add" and "edit" — the presence of
 * an `id` is what distinguishes them. Splitting that into two hooks at the call
 * site would mean every page carrying the same `id ? update : create` branch, so
 * the branch lives here instead, once.
 */
export function useSaveCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: CompanyInput & { id?: string }) =>
      id
        ? api.patch<Company>(`/admin/companies/${id}`, input)
        : api.post<Company>('/admin/companies', input),
    onSuccess(_data, vars) {
      void qc.invalidateQueries({ queryKey: adminKeys.all });
      toast.success(vars.id ? 'Company updated' : 'Company added');
    },
    onError: onErr('Could not save that company'),
  });
}

export function useSaveCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: CategoryInput & { id?: string }) =>
      id
        ? api.patch<Category>(`/admin/categories/${id}`, input)
        : api.post<Category>('/admin/categories', input),
    onSuccess(_data, vars) {
      void qc.invalidateQueries({ queryKey: adminKeys.all });
      toast.success(vars.id ? 'Category updated' : 'Category created');
    },
    onError: onErr('Could not save that category'),
  });
}

export function useSaveAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: AnnouncementInput & { id?: string }) =>
      id
        ? api.patch<Announcement>(`/admin/announcements/${id}`, input)
        : api.post<Announcement>('/admin/announcements', input),
    onSuccess(_data, vars) {
      void qc.invalidateQueries({ queryKey: adminKeys.all });
      toast.success(vars.id ? 'Announcement updated' : 'Announcement posted');
    },
    onError: onErr('Could not save that announcement'),
  });
}

export function useSaveBanner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: BannerInput & { id?: string }) =>
      id
        ? api.patch<Banner>(`/admin/banners/${id}`, input)
        : api.post<Banner>('/admin/banners', input),
    onSuccess(_data, vars) {
      void qc.invalidateQueries({ queryKey: adminKeys.all });
      toast.success(vars.id ? 'Banner updated' : 'Banner added');
    },
    onError: onErr('Could not save that banner'),
  });
}

export function useDeleteTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/admin/tags/${id}`),
    onSuccess() {
      void qc.invalidateQueries({ queryKey: adminKeys.tags });
      toast.success('Tag deleted');
    },
    onError: onErr('Could not delete that tag'),
  });
}

/** Alias — the settings page reads better as `useSiteSettings()`. */
export const useSiteSettings = useAdminSettings;

export function useDeleteCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/admin/companies/${id}`),
    onSuccess() {
      void qc.invalidateQueries({ queryKey: adminKeys.all });
      toast.success('Company deleted');
    },
    onError: onErr('Could not delete that company'),
  });
}

export function useAdminCategories() {
  return useQuery({
    queryKey: adminKeys.categories,
    queryFn: () => api.get<Category[]>('/admin/categories'),
  });
}

export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CategoryInput) => api.post<Category>('/admin/categories', input),
    onSuccess() {
      void qc.invalidateQueries({ queryKey: adminKeys.all });
      toast.success('Category created');
    },
    onError: onErr('Could not create that category'),
  });
}

export function useDeleteCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/admin/categories/${id}`),
    onSuccess() {
      void qc.invalidateQueries({ queryKey: adminKeys.all });
      toast.success('Category deleted');
    },
    onError: onErr('Could not delete that category'),
  });
}

export function useAdminTags() {
  return useQuery({
    queryKey: adminKeys.tags,
    queryFn: () => api.get<Tag[]>('/admin/tags'),
  });
}

export function useCreateTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.post<Tag>('/admin/tags', { name }),
    onSuccess() {
      void qc.invalidateQueries({ queryKey: adminKeys.tags });
    },
    onError: onErr('Could not create that tag'),
  });
}

// ── Announcements & banners ──────────────────────────────────────────────

export function useAdminAnnouncements() {
  return useQuery({
    queryKey: adminKeys.announcements,
    queryFn: () => api.getPaginated<Announcement>('/admin/announcements?limit=50'),
  });
}

export function useCreateAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AnnouncementInput) => api.post<Announcement>('/admin/announcements', input),
    onSuccess() {
      void qc.invalidateQueries({ queryKey: adminKeys.all });
      toast.success('Announcement posted');
    },
    onError: onErr('Could not post that announcement'),
  });
}

export function useDeleteAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/admin/announcements/${id}`),
    onSuccess() {
      void qc.invalidateQueries({ queryKey: adminKeys.all });
      toast.success('Announcement removed');
    },
    onError: onErr('Could not remove that announcement'),
  });
}

export function useAdminBanners() {
  return useQuery({
    queryKey: adminKeys.banners,
    queryFn: () => api.getPaginated<Banner>('/admin/banners?limit=50'),
  });
}

export function useCreateBanner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: BannerInput) => api.post<Banner>('/admin/banners', input),
    onSuccess() {
      void qc.invalidateQueries({ queryKey: adminKeys.all });
      toast.success('Banner added');
    },
    onError: onErr('Could not add that banner'),
  });
}

export function useDeleteBanner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/admin/banners/${id}`),
    onSuccess() {
      void qc.invalidateQueries({ queryKey: adminKeys.all });
      toast.success('Banner removed');
    },
    onError: onErr('Could not remove that banner'),
  });
}

// ── Settings & uploads ───────────────────────────────────────────────────

export function useAdminSettings() {
  return useQuery({
    queryKey: adminKeys.settings,
    queryFn: () => api.get<SiteSettings>('/admin/settings'),
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateSiteSettingsInput) =>
      api.patch<SiteSettings>('/admin/settings', input),
    onSuccess() {
      void qc.invalidateQueries({ queryKey: adminKeys.settings });
      toast.success('Settings saved');
    },
    onError: onErr('Could not save those settings'),
  });
}

/**
 * Cloudinary direct upload.
 *
 * The server signs the request; the browser uploads straight to Cloudinary. The
 * API secret never reaches the client and the image bytes never transit our
 * server. If Cloudinary is not configured the signature endpoint returns 503,
 * which the form surfaces as "paste a URL instead" rather than as a crash.
 */
export function useUploadImage() {
  return useMutation({
    async mutationFn({
      file,
      folder,
    }: {
      file: File;
      folder: 'jobs' | 'companies' | 'banners' | 'avatars';
    }): Promise<string> {
      const sig = await api.post<UploadSignatureResponse>('/admin/uploads/signature', { folder });

      const form = new FormData();
      form.append('file', file);
      form.append('api_key', sig.apiKey);
      form.append('timestamp', String(sig.timestamp));
      form.append('signature', sig.signature);
      form.append('folder', sig.folder);

      const res = await fetch(sig.uploadUrl, { method: 'POST', body: form });
      if (!res.ok) throw new ApiError(res.status, 'INTERNAL_ERROR', 'Upload to Cloudinary failed');

      const json = (await res.json()) as { secure_url: string };
      return json.secure_url;
    },

    onError: onErr('Could not upload that image'),
  });
}
