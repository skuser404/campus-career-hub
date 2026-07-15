'use client';

import {
  JOB_MODES,
  JOB_MODE_LABELS,
  JOB_STATUSES,
  JOB_STATUS_LABELS,
  jobInputSchema,
  type Job,
  type JobInput,
  type ParsedJob,
} from '@cch/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { ImageIcon, Loader2, Upload, X } from 'lucide-react';
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
import { useCreateJob, useUpdateJob, useUploadImage } from '@/hooks/use-admin';

interface JobFormProps {
  job?: Job;
  prefill?: ParsedJob | null;
}

/** Empty string / null → undefined, else a number. Keeps optional number fields truly optional. */
const numberOrUndef = (v: unknown) =>
  v === '' || v === null || v === undefined ? undefined : Number(v);

/** `datetime-local` wants `YYYY-MM-DDTHH:mm`, not a full ISO string. */
const toLocalDateTime = (iso: string | Date | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

/**
 * The New / Edit Opportunity form.
 *
 * Validated by `jobInputSchema` — the same schema the API validates against, so
 * there is no second copy of the rules to drift. Company, role and skills are
 * free text: the API finds-or-creates the company and each skill tag, so the
 * admin just types.
 */
export function JobForm({ job, prefill }: JobFormProps) {
  const router = useRouter();
  const isEdit = Boolean(job);

  const create = useCreateJob();
  const update = useUpdateJob();
  const upload = useUploadImage();

  const [skillInput, setSkillInput] = React.useState('');

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
          companyName: job.company.name,
          role: job.role,
          description: job.description,
          eligibility: job.eligibility ?? '',
          companyLogoUrl: job.companyLogoUrl ?? job.company.logoUrl ?? '',
          salaryFromLpa: job.salaryFromLpa ?? undefined,
          salaryToLpa: job.salaryToLpa ?? undefined,
          internshipStipend: job.internshipStipend ?? '',
          location: job.location ?? '',
          mode: job.mode,
          deadline: toLocalDateTime(job.deadline) as unknown as Date,
          applicationLink: job.applicationLink,
          whatsappGroupLink: job.whatsappGroupLink ?? '',
          collegeRegLink: job.collegeRegLink ?? '',
          imageUrl: job.imageUrl ?? '',
          status: job.status,
          isFeatured: job.isFeatured,
          skills: job.tags.map((t) => t.name),
          departmentIds: job.departments.map((d) => d.id),
          years: job.years,
        }
      : {
          mode: 'not_mentioned',
          status: 'draft',
          isFeatured: false,
          skills: [],
          departmentIds: [],
          years: [],
        },
  });

  const skills = watch('skills') ?? [];
  const imageUrl = watch('imageUrl');

  /**
   * Seed the form from a parsed WhatsApp message. Only fields the parser found
   * are written, so a miss leaves the field blank rather than clobbering it.
   */
  React.useEffect(() => {
    if (!prefill) return;
    const set = (field: keyof JobInput, value: unknown) =>
      setValue(field, value as never, { shouldDirty: true, shouldValidate: true });

    if (prefill.companyName) set('companyName', prefill.companyName);
    if (prefill.role) set('role', prefill.role);
    if (prefill.description) set('description', prefill.description);
    if (prefill.salaryFromLpa != null) set('salaryFromLpa', prefill.salaryFromLpa);
    if (prefill.salaryToLpa != null) set('salaryToLpa', prefill.salaryToLpa);
    if (prefill.internshipStipend) set('internshipStipend', prefill.internshipStipend);
    if (prefill.location) set('location', prefill.location);
    if (prefill.mode) set('mode', prefill.mode);
    if (prefill.applicationLink) set('applicationLink', prefill.applicationLink);
    if (prefill.whatsappGroupLink) set('whatsappGroupLink', prefill.whatsappGroupLink);
    if (prefill.collegeRegLink) set('collegeRegLink', prefill.collegeRegLink);
    if (prefill.deadline) set('deadline', toLocalDateTime(prefill.deadline));
    if (prefill.skills.length > 0) set('skills', prefill.skills);

    // Eligibility, folding in the batch the parser found separately.
    const elig = [prefill.eligibility, prefill.batch ? `Batch: ${prefill.batch}` : null]
      .filter(Boolean)
      .join(' · ');
    if (elig) set('eligibility', elig);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill]);

  const addSkill = (raw: string) => {
    const value = raw.trim().replace(/,$/, '').trim();
    if (!value) return;
    if (!skills.some((s) => s.toLowerCase() === value.toLowerCase())) {
      setValue('skills', [...skills, value], { shouldDirty: true });
    }
    setSkillInput('');
  };

  const removeSkill = (name: string) => {
    setValue(
      'skills',
      skills.filter((s) => s !== name),
      { shouldDirty: true },
    );
  };

  const handleUpload = async (file: File) => {
    const url = await upload.mutateAsync({ file, folder: 'jobs' });
    setValue('imageUrl', url, { shouldDirty: true });
  };

  const onSubmit = (data: JobInput) => {
    const done = { onSuccess: () => router.push('/admin/jobs') };
    if (isEdit && job) update.mutate({ id: job.id, ...data }, done);
    else create.mutate(data, done);
  };

  const pending = create.isPending || update.isPending;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid gap-6 lg:grid-cols-3">
      {/* ── Main column ──────────────────────────────────────────────────── */}
      <div className="space-y-6 lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Details</CardTitle>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Company Name" required error={errors.companyName?.message}>
                <Input placeholder="Razorpay" error={Boolean(errors.companyName)} {...register('companyName')} />
              </Field>

              <Field label="Role" required error={errors.role?.message}>
                <Input placeholder="Backend Engineer" error={Boolean(errors.role)} {...register('role')} />
              </Field>
            </div>

            <Field label="JD (Job Description)" required error={errors.description?.message}>
              <Textarea
                rows={6}
                placeholder="Paste or write the full job description…"
                error={Boolean(errors.description)}
                {...register('description')}
              />
            </Field>

            <Field label="Eligibility" error={errors.eligibility?.message}>
              <Textarea
                rows={2}
                placeholder="2026 batch, CGPA 7+, no active backlogs"
                {...register('eligibility')}
              />
            </Field>

            <Field label="Skills" hint="Type a skill and press Enter">
              <Input
                value={skillInput}
                onChange={(e) => setSkillInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    addSkill(skillInput);
                  }
                }}
                onBlur={() => addSkill(skillInput)}
                placeholder="React, Node.js, SQL…"
              />
              {skills.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {skills.map((s) => (
                    <Badge key={s} variant="secondary" className="gap-1">
                      {s}
                      <button
                        type="button"
                        onClick={() => removeSkill(s)}
                        aria-label={`Remove ${s}`}
                        className="rounded hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              ) : null}
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Compensation, location & links</CardTitle>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Salary From (LPA)" error={errors.salaryFromLpa?.message}>
                <Input
                  type="number"
                  step="0.1"
                  inputMode="decimal"
                  placeholder="4.5"
                  error={Boolean(errors.salaryFromLpa)}
                  {...register('salaryFromLpa', { setValueAs: numberOrUndef })}
                />
              </Field>

              <Field label="Salary To (LPA)" error={errors.salaryToLpa?.message}>
                <Input
                  type="number"
                  step="0.1"
                  inputMode="decimal"
                  placeholder="6"
                  error={Boolean(errors.salaryToLpa)}
                  {...register('salaryToLpa', { setValueAs: numberOrUndef })}
                />
              </Field>

              <Field label="Internship Stipend">
                <Input placeholder="40k / month" {...register('internshipStipend')} />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Location">
                <Input placeholder="Bengaluru" {...register('location')} />
              </Field>

              <Field label="Work Mode">
                <Controller
                  name="mode"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
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
              </Field>
            </div>

            <Field label="Deadline" hint="Leave blank if there is no fixed deadline">
              <Input type="datetime-local" {...register('deadline')} />
            </Field>

            <Field label="Application Link" required error={errors.applicationLink?.message}>
              <Input
                type="url"
                placeholder="https://company.com/apply"
                error={Boolean(errors.applicationLink)}
                {...register('applicationLink')}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="WhatsApp Group Link" error={errors.whatsappGroupLink?.message}>
                <Input type="url" placeholder="https://chat.whatsapp.com/…" {...register('whatsappGroupLink')} />
              </Field>

              <Field label="College Registration Link" error={errors.collegeRegLink?.message}>
                <Input type="url" placeholder="https://…" {...register('collegeRegLink')} />
              </Field>
            </div>

            <Field label="Company Logo URL" error={errors.companyLogoUrl?.message}>
              <Input type="url" placeholder="https://…/logo.png" {...register('companyLogoUrl')} />
            </Field>
          </CardContent>
        </Card>
      </div>

      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Publishing</CardTitle>
          </CardHeader>

          <CardContent className="space-y-4">
            <Field label="Status">
              <Controller
                name="status"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
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
                publishing notifies every student.
              </p>
            </Field>

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
                  variant="secondary"
                  size="icon"
                  className="absolute right-2 top-2"
                  onClick={() => setValue('imageUrl', '', { shouldDirty: true })}
                  aria-label="Remove cover image"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <label className="flex aspect-video cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-border text-muted-foreground transition-colors hover:border-foreground/30">
                {upload.isPending ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : (
                  <>
                    <Upload className="mb-1 h-5 w-5" />
                    <span className="text-xs">Upload (optional)</span>
                  </>
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleUpload(f);
                  }}
                />
              </label>
            )}

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <ImageIcon className="h-3.5 w-3.5" />
              or paste a URL:
            </div>
            <Input type="url" placeholder="https://…" {...register('imageUrl')} />
          </CardContent>
        </Card>
      </div>
    </form>
  );
}

/** A labelled field wrapper — keeps every row consistent. */
function Field({
  label,
  required,
  hint,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1">
        {label}
        {required ? <span className="text-destructive">*</span> : null}
      </Label>
      {children}
      {hint && !error ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
