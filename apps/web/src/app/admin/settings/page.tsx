'use client';

import { siteSettingsSchema, type SiteSettings } from '@cch/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle } from 'lucide-react';
import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { Label, Switch } from '@/components/ui/primitives';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState, PageHeader } from '@/components/ui/states';
import { useSiteSettings, useUpdateSettings } from '@/hooks/use-admin';

export default function AdminSettingsPage() {
  const { data: settings, isLoading, isError, refetch } = useSiteSettings();
  const update = useUpdateSettings();

  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    formState: { errors, isDirty },
  } = useForm<SiteSettings>({
    resolver: zodResolver(siteSettingsSchema),
  });

  React.useEffect(() => {
    if (settings) reset(settings);
  }, [settings, reset]);

  const maintenanceMode = watch('maintenanceMode');

  if (isError) return <ErrorState onRetry={() => void refetch()} />;

  if (isLoading || !settings) {
    return (
      <div className="max-w-2xl space-y-6">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Website settings"
        description="These take effect immediately — no redeploy needed."
      />

      <form
        onSubmit={handleSubmit((data) => update.mutate(data, { onSuccess: () => reset(data) }))}
        className="space-y-6"
        noValidate
      >
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Identity</CardTitle>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="siteName">Site name</Label>
              <Input id="siteName" error={Boolean(errors.siteName)} {...register('siteName')} />
              {errors.siteName ? (
                <p role="alert" className="text-xs text-destructive">
                  {errors.siteName.message}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="tagline">Tagline</Label>
              <Textarea id="tagline" rows={2} {...register('tagline')} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="supportEmail">Support email</Label>
              <Input
                id="supportEmail"
                type="email"
                error={Boolean(errors.supportEmail)}
                {...register('supportEmail')}
              />
              {errors.supportEmail ? (
                <p role="alert" className="text-xs text-destructive">
                  {errors.supportEmail.message}
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Features</CardTitle>
            <CardDescription>Flip a switch, and it is live for every student at once.</CardDescription>
          </CardHeader>

          <CardContent className="space-y-1">
            <Toggle
              control={control}
              name="allowRegistration"
              label="Allow new registrations"
              hint="Turn this off to close signups outside placement season."
            />
            <Toggle
              control={control}
              name="showBanners"
              label="Show banners"
              hint="Promotional images on the landing page."
            />
            <Toggle
              control={control}
              name="showAnnouncements"
              label="Show announcements"
              hint="Notices on the landing page and every dashboard."
            />
          </CardContent>
        </Card>

        <Card className={maintenanceMode ? 'border-warning' : undefined}>
          <CardHeader>
            <CardTitle className="text-base">Maintenance</CardTitle>
          </CardHeader>

          <CardContent className="space-y-4">
            <Toggle
              control={control}
              name="maintenanceMode"
              label="Maintenance mode"
              hint="Students see the message below instead of the site. Admins are unaffected."
            />

            {/* The warning appears only when the switch is on. A permanently
                visible caution is quickly ignored; one that appears in response
                to the action still gets read. */}
            {maintenanceMode ? (
              <div className="flex items-start gap-2.5 rounded-lg border border-warning/40 bg-warning/10 p-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                <p className="text-xs text-muted-foreground">
                  <strong className="text-foreground">Maintenance mode is on.</strong> Students
                  cannot browse opportunities while this is enabled. Remember to switch it back off.
                </p>
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="maintenanceMessage">Maintenance message</Label>
              <Textarea id="maintenanceMessage" rows={2} {...register('maintenanceMessage')} />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => reset(settings)} disabled={!isDirty}>
            Discard changes
          </Button>
          <Button type="submit" loading={update.isPending} disabled={!isDirty}>
            Save settings
          </Button>
        </div>
      </form>
    </div>
  );
}

function Toggle({
  control,
  name,
  label,
  hint,
}: {
  control: ReturnType<typeof useForm<SiteSettings>>['control'];
  name: 'allowRegistration' | 'maintenanceMode' | 'showBanners' | 'showAnnouncements';
  label: string;
  hint: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border py-3 last:border-0">
      <div className="min-w-0">
        <Label htmlFor={name} className="cursor-pointer">
          {label}
        </Label>
        <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      </div>

      <Controller
        name={name}
        control={control}
        render={({ field }) => (
          <Switch
            id={name}
            checked={Boolean(field.value)}
            onCheckedChange={field.onChange}
            className="mt-0.5 shrink-0"
          />
        )}
      />
    </div>
  );
}
