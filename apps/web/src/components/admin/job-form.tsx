'use client';

import {
  ACADEMIC_YEARS,
  JOB_MODES,
  JOB_MODE_LABELS,
  JOB_STATUSES,
  JOB_STATUS_LABELS,
  YEAR_LABELS,
  jobInputSchema,
  type Job,
  type JobInput,
  type ParsedJob,
} from '@cch/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { ImageIcon, Loader2, Plus, Upload, Users, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import {
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from '@/components/ui/primitives';
import {
  useAdminCategories,
  useAdminCompanies,
  useAdminDepartments,
  useAdminTags,
  useCreateJob,
  useCreateTag,
  useUpdateJob,
  useUploadImage,
} from '@/hooks/use-admin';
import { cn } from '@/lib/utils';

interface JobFormProps {
  /** Absent for create, present for edit. */
  job?: Job;
  /** Structured fields extracted from a pasted WhatsApp message, to seed a new opportunity. */
  prefill?: ParsedJob | null;
}

/**
 * The job form.
 *
 * Validated by `jobInputSchema` — the very same schema the API validates the
 * request against. There is no client-side copy of the rules to drift out of
 * sync, so a change to what counts as a valid opportunity is a one-line edit in
 * `packages/shared`.
 */
export function JobForm({ job, prefill }: JobFormProps) {
  const router = useRouter();
  const isEdit = Boolean(job);

  const { data: companies } = useAdminCompanies();
  const { data: categories } = useAdminCategories();
  const { data: tags } = useAdminTags();
  const { data: departments } = useAdminDepartments();

  const create = useCreateJob();
  const update = useUpdateJob();
  const upload = useUploadImage();
  const createTag = useCreateTag();

  const [newTag, setNewTag] = React.useState('');

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors, isDirty },
  } = useForm<JobInput>({
    resolver: zodResolver(jobInputSchema),
    defaultValues: job
      ? {
          companyId: job.company.id,
          categoryId: job.category.id,
          role: job.role,
          description: job.description,
          eligibility: job.eligibility ?? '',
          salaryMin: job.salaryMin ?? undefined,
          salaryMax: job.salaryMax ?? undefined,
          salaryCurrency: job.salaryCurrency,
          salaryText: job.salaryText ?? '',
          location: job.location ?? '',
          mode: job.mode,
          // `datetime-local` wants `YYYY-MM-DDTHH:mm` and rejects a full ISO
          // string, so the trailing seconds and zone are trimmed off.
          deadline: job.deadline
            ? (new Date(job.deadline).toISOString().slice(0, 16) as unknown as Date)
            : null,
          applicationLink: job.applicationLink,
          imageUrl: job.imageUrl ?? '',
          status: job.status,
          isFeatured: job.isFeatured,
          tagIds: job.tags.map((t) => t.id),
          departmentIds: job.departments.map((d) => d.id),
          years: job.years,
        }
      : {
          salaryCurrency: 'INR',
          mode: 'onsite',
          status: 'draft',
          isFeatured: false,
          tagIds: [],
          // Empty = open to EVERY department and EVERY year. This is the default a
          // new opportunity gets, and it is the safe one: a posting nobody can see
          // is a far worse failure than one everybody can.
          departmentIds: [],
          years: [],
        },
  });

  const selectedTagIds = watch('tagIds') ?? [];
  const selectedDeptIds = watch('departmentIds') ?? [];
  const selectedYears = watch('years') ?? [];
  const imageUrl = watch('imageUrl');

  /**
   * Seed the form from a parsed WhatsApp message.
   *
   * Only fields the parser actually found are written, so an extraction miss
   * leaves the field blank rather than clobbering it with an empty string. Company
   * and tags are matched to existing records by name; an unmatched company is
   * left for the admin to pick or add — the parser never invents a company row.
   */
  React.useEffect(() => {
    if (!prefill) return;

    const set = (field: keyof JobInput, value: unknown) =>
      setValue(field, value as never, { shouldDirty: true, shouldValidate: true });

    if (prefill.role) set('role', prefill.role);
    if (prefill.description) set('description', prefill.description);
    if (prefill.eligibility) set('eligibility', prefill.eligibility);
    if (prefill.salaryText) set('salaryText', prefill.salaryText);
    if (prefill.location) set('location', prefill.location);
    if (prefill.mode) set('mode', prefill.mode);
    if (prefill.applicationLink) set('applicationLink', prefill.applicationLink);
    if (prefill.deadline) {
      // `datetime-local` wants `YYYY-MM-DDTHH:mm`, not a full ISO string.
      set('deadline', new Date(prefill.deadline).toISOString().slice(0, 16));
    }

    if (prefill.companyName && companies?.items) {
      const match = companies.items.find(
        (c) => c.name.toLowerCase() === prefill.companyName?.toLowerCase(),
      );
      if (match) set('companyId', match.id);
    }

    if (prefill.tags.length > 0 && tags) {
      const ids = tags
        .filter((t) => prefill.tags.some((p) => p.toLowerCase() === t.name.toLowerCase()))
        .map((t) => t.id);
      if (ids.length > 0) set('tagIds', ids);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill, companies?.items, tags]);

  const onSubmit = (data: JobInput) => {
    if (isEdit && job) {
      update.mutate({ id: job.id, ...data }, { onSuccess: () => router.push('/admin/jobs') });
    } else {
      create.mutate(data, { onSuccess: () => router.push('/admin/jobs') });
    }
  };

  const handleUpload = async (file: File) => {
    const url = await upload.mutateAsync({ file, folder: 'jobs' });
    setValue('imageUrl', url, { shouldDirty: true });
  };

  const toggleTag = (id: string) => {
    setValue(
      'tagIds',
      selectedTagIds.includes(id)
        ? selectedTagIds.filter((t) => t !== id)
        : [...selectedTagIds, id],
      { shouldDirty: true },
    );
  };

  const toggleDept = (id: string) => {
    setValue(
      'departmentIds',
      selectedDeptIds.includes(id)
        ? selectedDeptIds.filter((d) => d !== id)
        : [...selectedDeptIds, id],
      { shouldDirty: true },
    );
  };

  const toggleYear = (year: number) => {
    setValue(
      'years',
      selectedYears.includes(year)
        ? selectedYears.filter((y) => y !== year)
        : [...selectedYears, year].sort((a, b) => a - b),
      { shouldDirty: true },
    );
  };

  const addTag = async () => {
    if (!newTag.trim()) return;
    const tag = await createTag.mutateAsync(newTag.trim());
    if (tag) {
      setValue('tagIds', [...selectedTagIds, tag.id], { shouldDirty: true });
      setNewTag('');
    }
  };

  const pending = create.isPending || update.isPending;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* ── Core ────────────────────────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Details</CardTitle>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="companyId">
                    Company <span className="text-destructive">*</span>
                  </Label>
                  <Controller
                    name="companyId"
                    control={control}
                    render={({ field }) => (
                      <Select value={field.value ?? ''} onValueChange={field.onChange}>
                        <SelectTrigger id="companyId" error={Boolean(errors.companyId)}>
                          <SelectValue placeholder="Select a company" />
                        </SelectTrigger>
                        <SelectContent>
                          {companies?.items.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  {errors.companyId ? (
                    <p role="alert" className="text-xs text-destructive">
                      Select a company
                    </p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="categoryId">
                    Category <span className="text-destructive">*</span>
                  </Label>
                  <Controller
                    name="categoryId"
                    control={control}
                    render={({ field }) => (
                      <Select value={field.value ?? ''} onValueChange={field.onChange}>
                        <SelectTrigger id="categoryId" error={Boolean(errors.categoryId)}>
                          <SelectValue placeholder="Select a category" />
                        </SelectTrigger>
                        <SelectContent>
                          {categories?.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  {errors.categoryId ? (
                    <p role="alert" className="text-xs text-destructive">
                      Select a category
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="role">
                  Role <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="role"
                  placeholder="Software Engineer, University Graduate 2026"
                  error={Boolean(errors.role)}
                  {...register('role')}
                />
                {errors.role ? (
                  <p role="alert" className="text-xs text-destructive">
                    {errors.role.message}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">
                  Description <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="description"
                  rows={7}
                  placeholder="What the role involves, what the team does, what a student would actually be working on."
                  error={Boolean(errors.description)}
                  {...register('description')}
                />
                {errors.description ? (
                  <p role="alert" className="text-xs text-destructive">
                    {errors.description.message}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="eligibility">Eligibility</Label>
                <Textarea
                  id="eligibility"
                  rows={4}
                  placeholder="Branch, batch, CGPA cut-off, backlog policy…"
                  {...register('eligibility')}
                />
                <p className="text-xs text-muted-foreground">
                  Be specific. A vague eligibility line is the single biggest cause of wasted
                  applications.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="applicationLink">
                  Application link <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="applicationLink"
                  type="url"
                  placeholder="https://careers.company.com/apply/…"
                  error={Boolean(errors.applicationLink)}
                  {...register('applicationLink')}
                />
                {errors.applicationLink ? (
                  <p role="alert" className="text-xs text-destructive">
                    {errors.applicationLink.message}
                  </p>
                ) : null}
              </div>
            </CardContent>
          </Card>

          {/* ── Compensation & logistics ────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Compensation & logistics</CardTitle>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="salaryMin">Salary from</Label>
                  <Input
                    id="salaryMin"
                    type="number"
                    inputMode="numeric"
                    placeholder="1200000"
                    {...register('salaryMin')}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="salaryMax">Salary to</Label>
                  <Input
                    id="salaryMax"
                    type="number"
                    inputMode="numeric"
                    placeholder="1800000"
                    error={Boolean(errors.salaryMax)}
                    {...register('salaryMax')}
                  />
                  {errors.salaryMax ? (
                    <p role="alert" className="text-xs text-destructive">
                      {errors.salaryMax.message}
                    </p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="salaryText">Or free text</Label>
                  <Input
                    id="salaryText"
                    placeholder="As per company norms"
                    {...register('salaryText')}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="location">Location</Label>
                  <Input id="location" placeholder="Bengaluru, India" {...register('location')} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="mode">Work mode</Label>
                  <Controller
                    name="mode"
                    control={control}
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger id="mode">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {JOB_MODES.map((m) => (
                            <SelectItem key={m} value={m}>
                              {JOB_MODE_LABELS[m]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="deadline">Deadline</Label>
                  <Input
                    id="deadline"
                    type="datetime-local"
                    error={Boolean(errors.deadline)}
                    {...register('deadline')}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Sidebar ──────────────────────────────────────────────────── */}
        <div className="space-y-6">
          {/*
            ═══════════════════════════════════════════════════════════════
            WHO CAN SEE THIS — the most consequential control on the page.
            ═══════════════════════════════════════════════════════════════

            These are not filters or tags. They are an access-control list: the
            API's job queries exclude ineligible students in SQL, so an ISE
            student cannot reach a CSE-only posting even with its direct URL.

            Selecting NOTHING means "everyone", which is the opposite of what a
            checkbox list usually implies — so the UI says so explicitly, in
            words, right where the admin is looking. Getting this backwards would
            silently hide every new posting from the entire university.
          */}
          <Card className="border-primary/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4 text-primary" />
                Who can see this
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label>Departments</Label>

                <div className="flex flex-wrap gap-1.5">
                  {departments?.map((dept) => {
                    const on = selectedDeptIds.includes(dept.id);
                    return (
                      <button
                        key={dept.id}
                        type="button"
                        onClick={() => toggleDept(dept.id)}
                        aria-pressed={on}
                        className={cn(
                          'rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          on
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border bg-background text-muted-foreground hover:border-foreground/30 hover:text-foreground',
                        )}
                      >
                        {dept.code}
                      </button>
                    );
                  })}
                </div>

                <p
                  className={cn(
                    'text-xs',
                    selectedDeptIds.length === 0
                      ? 'font-medium text-primary'
                      : 'text-muted-foreground',
                  )}
                >
                  {selectedDeptIds.length === 0
                    ? 'Nothing selected → visible to EVERY department.'
                    : `Only ${selectedDeptIds.length} department${selectedDeptIds.length === 1 ? '' : 's'} can see this.`}
                </p>
              </div>

              <div className="space-y-2">
                <Label>Years</Label>

                <div className="flex flex-wrap gap-1.5">
                  {ACADEMIC_YEARS.map((year) => {
                    const on = selectedYears.includes(year);
                    return (
                      <button
                        key={year}
                        type="button"
                        onClick={() => toggleYear(year)}
                        aria-pressed={on}
                        className={cn(
                          'rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          on
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border bg-background text-muted-foreground hover:border-foreground/30 hover:text-foreground',
                        )}
                      >
                        {YEAR_LABELS[year]}
                      </button>
                    );
                  })}
                </div>

                <p
                  className={cn(
                    'text-xs',
                    selectedYears.length === 0
                      ? 'font-medium text-primary'
                      : 'text-muted-foreground',
                  )}
                >
                  {selectedYears.length === 0
                    ? 'Nothing selected → visible to EVERY year.'
                    : `Only ${selectedYears.map((y) => `year ${y}`).join(', ')} can see this.`}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Publishing</CardTitle>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Controller
                  name="status"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {JOB_STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {JOB_STATUS_LABELS[s]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <p className="text-xs text-muted-foreground">
                  Only <strong>Published</strong> opportunities are visible to students, and
                  publishing notifies every eligible student. A draft is unreachable through the
                  API, not merely hidden in the UI.
                </p>
              </div>

              <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border p-3">
                <span className="text-sm font-medium">Featured</span>
                <Controller
                  name="isFeatured"
                  control={control}
                  render={({ field }) => (
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  )}
                />
              </label>

              <div className="flex flex-col gap-2 pt-2">
                <Button type="submit" loading={pending} disabled={isEdit && !isDirty}>
                  {isEdit ? 'Save changes' : 'Create opportunity'}
                </Button>
                <Button type="button" variant="ghost" onClick={() => router.push('/admin/jobs')}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* ── Image ──────────────────────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Cover image</CardTitle>
            </CardHeader>

            <CardContent className="space-y-3">
              {imageUrl ? (
                <div className="relative overflow-hidden rounded-lg border border-border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imageUrl} alt="" className="aspect-video w-full object-cover" />
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    className="absolute right-2 top-2 h-7 w-7"
                    onClick={() => setValue('imageUrl', '', { shouldDirty: true })}
                    aria-label="Remove image"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <label
                  className={cn(
                    'flex aspect-video cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border transition-colors',
                    'hover:border-primary hover:bg-accent/50',
                  )}
                >
                  {upload.isPending ? (
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  ) : (
                    <>
                      <Upload className="h-5 w-5 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Upload an image</span>
                    </>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    disabled={upload.isPending}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleUpload(file);
                    }}
                  />
                </label>
              )}

              {/* The URL field is always available. If Cloudinary is not
                  configured the upload endpoint returns 503, and this is the
                  fallback that keeps the feature usable rather than broken. */}
              <div className="space-y-2">
                <Label htmlFor="imageUrl" className="flex items-center gap-1.5 text-xs">
                  <ImageIcon className="h-3.5 w-3.5" />
                  Or paste an image URL
                </Label>
                <Input
                  id="imageUrl"
                  type="url"
                  placeholder="https://…"
                  error={Boolean(errors.imageUrl)}
                  {...register('imageUrl')}
                />
                {errors.imageUrl ? (
                  <p role="alert" className="text-xs text-destructive">
                    {errors.imageUrl.message}
                  </p>
                ) : null}
              </div>
            </CardContent>
          </Card>

          {/* ── Tags ───────────────────────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Skills & tags</CardTitle>
            </CardHeader>

            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  placeholder="Add a tag…"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      // Without this the Enter key would submit the whole form
                      // instead of adding the tag.
                      e.preventDefault();
                      void addTag();
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => void addTag()}
                  disabled={!newTag.trim() || createTag.isPending}
                  aria-label="Add tag"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {tags?.map((tag) => {
                  const selected = selectedTagIds.includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => toggleTag(tag.id)}
                      aria-pressed={selected}
                      className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
                    >
                      <Badge
                        variant={selected ? 'default' : 'outline'}
                        className={cn(
                          'cursor-pointer transition-colors',
                          selected && 'bg-primary text-primary-foreground',
                        )}
                      >
                        {tag.name}
                      </Badge>
                    </button>
                  );
                })}
              </div>

              {errors.tagIds ? (
                <p role="alert" className="text-xs text-destructive">
                  {errors.tagIds.message}
                </p>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </form>
  );
}
