'use client';

import { YEAR_LABELS, updateOwnProfileSchema, type UpdateOwnProfileInput } from '@cch/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { Lock } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage, Label, Separator } from '@/components/ui/primitives';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/ui/states';
import { useCurrentUser, useUpdateProfile } from '@/hooks/use-auth';
import { formatDate, initials } from '@/lib/utils';

/**
 * A student may edit exactly two things about themselves: their phone number and
 * their avatar.
 *
 * Everything else — name, USN, department, year, section, batch — is an
 * institutional fact owned by the registrar's import. Department and year are what
 * decide which opportunities they can see, so letting a student edit their own
 * department would be a one-click escalation into another branch's postings.
 *
 * Those fields are therefore read-only HERE and, more importantly, absent from the
 * API's update schema. The lock badge is the honest explanation; the schema is the
 * enforcement.
 */
export default function ProfilePage() {
  const { data: user, isLoading } = useCurrentUser();
  const updateProfile = useUpdateProfile();

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<UpdateOwnProfileInput>({
    resolver: zodResolver(updateOwnProfileSchema),
    values: {
      phone: user?.phone ?? '',
      avatarUrl: user?.avatarUrl ?? null,
    },
  });

  if (isLoading || !user) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="mt-8 h-64 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
      <PageHeader
        title="Profile"
        description="Your academic record comes from the placement office and cannot be changed here."
      />

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="text-base">Academic record</CardTitle>
                <CardDescription>
                  Your department and year decide which opportunities you can see.
                </CardDescription>
              </div>
              <Badge variant="muted" className="shrink-0 gap-1">
                <Lock className="h-3 w-3" />
                Read-only
              </Badge>
            </div>
          </CardHeader>

          <CardContent>
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16">
                {user.avatarUrl ? <AvatarImage src={user.avatarUrl} alt="" /> : null}
                <AvatarFallback className="text-lg">{initials(user.fullName)}</AvatarFallback>
              </Avatar>

              <div className="min-w-0">
                <p className="truncate text-lg font-semibold">{user.fullName}</p>
                <p className="truncate text-sm text-muted-foreground">{user.email}</p>
              </div>
            </div>

            <Separator className="my-6" />

            <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
              <Field label="USN" value={user.usn} mono />
              <Field label="Department" value={user.department?.name ?? null} />
              <Field
                label="Year"
                value={user.year ? (YEAR_LABELS[user.year] ?? String(user.year)) : null}
              />
              <Field label="Section" value={user.section} />
              <Field label="Batch" value={user.batch} />
              <Field label="Member since" value={formatDate(user.createdAt)} />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contact details</CardTitle>
            <CardDescription>The only part of your profile you can change.</CardDescription>
          </CardHeader>

          <CardContent>
            <form
              onSubmit={handleSubmit((data) => updateProfile.mutate(data))}
              className="space-y-4"
              noValidate
            >
              <div className="space-y-2">
                <Label htmlFor="phone">Phone number</Label>
                <Input
                  id="phone"
                  type="tel"
                  autoComplete="tel"
                  placeholder="+91 98765 43210"
                  error={Boolean(errors.phone)}
                  {...register('phone')}
                />
                {errors.phone ? (
                  <p role="alert" className="text-xs text-destructive">
                    {errors.phone.message}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="avatarUrl">Avatar image URL</Label>
                <Input
                  id="avatarUrl"
                  type="url"
                  placeholder="https://…"
                  error={Boolean(errors.avatarUrl)}
                  {...register('avatarUrl')}
                />
                {errors.avatarUrl ? (
                  <p role="alert" className="text-xs text-destructive">
                    {errors.avatarUrl.message}
                  </p>
                ) : null}
              </div>

              {/* Disabled until something actually changes — a pointless request
                  and a button that lies about having work to do. */}
              <Button type="submit" loading={updateProfile.isPending} disabled={!isDirty}>
                Save changes
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd
        className={`mt-1 text-sm ${mono ? 'font-mono' : ''} ${!value ? 'text-muted-foreground' : ''}`}
      >
        {value ?? 'Not set'}
      </dd>
    </div>
  );
}
