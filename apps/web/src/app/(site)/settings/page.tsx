'use client';

import { changePasswordSchema, type ChangePasswordInput } from '@cch/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { Laptop, Monitor, Moon, ShieldAlert, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label, Separator } from '@/components/ui/primitives';
import { PageHeader } from '@/components/ui/states';
import { useChangePassword, useRevokeAllSessions, useSessions } from '@/hooks/use-auth';
import { cn, formatRelative } from '@/lib/utils';

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-10 sm:px-6 lg:px-8">
      <PageHeader title="Settings" description="Appearance, password, and active sessions." />

      <AppearanceCard />
      <PasswordCard />
      <SessionsCard />
    </div>
  );
}

function AppearanceCard() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  const options = [
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon },
    { value: 'system', label: 'System', icon: Monitor },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Appearance</CardTitle>
        <CardDescription>Choose how Campus Career Hub looks to you.</CardDescription>
      </CardHeader>

      <CardContent>
        <div className="grid grid-cols-3 gap-3">
          {options.map((opt) => {
            const Icon = opt.icon;
            // Before hydration we do not know the theme, so nothing is marked
            // selected — guessing would flash the wrong choice.
            const active = mounted && theme === opt.value;

            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setTheme(opt.value)}
                aria-pressed={active}
                className={cn(
                  'flex flex-col items-center gap-2 rounded-lg border p-4 text-sm font-medium transition-all',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-border text-muted-foreground hover:border-foreground/20 hover:text-foreground',
                )}
              >
                <Icon className="h-5 w-5" />
                {opt.label}
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function PasswordCard() {
  const change = useChangePassword();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Password</CardTitle>
        <CardDescription>
          Changing your password signs you out everywhere else — which is exactly what you want if
          you think somebody has it.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form
          onSubmit={handleSubmit((data) =>
            change.mutate(data, { onSuccess: () => reset() }),
          )}
          className="space-y-4"
          noValidate
        >
          <div className="space-y-2">
            <Label htmlFor="currentPassword">Current password</Label>
            <Input
              id="currentPassword"
              type="password"
              autoComplete="current-password"
              error={Boolean(errors.currentPassword)}
              {...register('currentPassword')}
            />
            {errors.currentPassword ? (
              <p role="alert" className="text-xs text-destructive">
                {errors.currentPassword.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="newPassword">New password</Label>
            <Input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              error={Boolean(errors.newPassword)}
              {...register('newPassword')}
            />
            {errors.newPassword ? (
              <p role="alert" className="text-xs text-destructive">
                {errors.newPassword.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm new password</Label>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              error={Boolean(errors.confirmPassword)}
              {...register('confirmPassword')}
            />
            {errors.confirmPassword ? (
              <p role="alert" className="text-xs text-destructive">
                {errors.confirmPassword.message}
              </p>
            ) : null}
          </div>

          <div className="flex justify-end pt-2">
            <Button type="submit" loading={change.isPending}>
              Update password
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function SessionsCard() {
  const { data: sessions, isLoading } = useSessions();
  const revoke = useRevokeAllSessions();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Active sessions</CardTitle>
        <CardDescription>Devices currently signed in to your account.</CardDescription>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : sessions && sessions.length > 0 ? (
          <>
            <ul className="space-y-2">
              {sessions.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center gap-3 rounded-lg border border-border p-3"
                >
                  <Laptop className="h-4 w-4 shrink-0 text-muted-foreground" />

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {/* A raw user-agent string is unreadable, so show the browser
                          and platform rather than 140 characters of tokens. */}
                      {parseUserAgent(s.userAgent)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {s.ip ?? 'Unknown IP'} · started {formatRelative(s.createdAt)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>

            <Separator className="my-4" />

            <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <div className="flex-1">
                <p className="text-sm font-medium">Sign out everywhere</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Revokes every session, including this one. You will need to sign in again.
                </p>
              </div>

              <Button
                variant="destructive"
                size="sm"
                onClick={() => revoke.mutate()}
                loading={revoke.isPending}
              >
                Revoke all
              </Button>
            </div>
          </>
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">No other active sessions.</p>
        )}
      </CardContent>
    </Card>
  );
}

/** Turn a user-agent string into something a person can read. */
function parseUserAgent(ua: string | null): string {
  if (!ua) return 'Unknown device';

  const browser =
    /Edg\//.test(ua) ? 'Edge'
    : /OPR\//.test(ua) ? 'Opera'
    : /Chrome\//.test(ua) ? 'Chrome'
    : /Safari\//.test(ua) ? 'Safari'
    : /Firefox\//.test(ua) ? 'Firefox'
    : 'Browser';

  const os =
    /Windows/.test(ua) ? 'Windows'
    : /Android/.test(ua) ? 'Android'
    : /iPhone|iPad/.test(ua) ? 'iOS'
    : /Mac OS X/.test(ua) ? 'macOS'
    : /Linux/.test(ua) ? 'Linux'
    : '';

  return os ? `${browser} on ${os}` : browser;
}
