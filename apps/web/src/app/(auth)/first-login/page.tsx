'use client';

import { firstLoginPasswordSchema, type FirstLoginPasswordInput } from '@cch/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { Check, Eye, EyeOff, ShieldAlert } from 'lucide-react';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/primitives';
import { useFirstLogin } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';

/** Mirrors `passwordSchema`. Shown live, so nobody discovers the rules one failed submit at a time. */
const RULES = [
  { label: 'At least 8 characters', test: (p: string) => p.length >= 8 },
  { label: 'One uppercase letter', test: (p: string) => /[A-Z]/.test(p) },
  { label: 'One lowercase letter', test: (p: string) => /[a-z]/.test(p) },
  { label: 'One number', test: (p: string) => /[0-9]/.test(p) },
];

/**
 * The forced first-login password change.
 *
 * A student arrives here holding a session that can do nothing else — the API
 * refuses every other endpoint with PASSWORD_CHANGE_REQUIRED until this form is
 * submitted. So there is deliberately no "skip", no "remind me later", and no
 * navigation away: those would all be lies, since nothing else would work anyway.
 */
export default function FirstLoginPage() {
  const firstLogin = useFirstLogin();
  const [showPassword, setShowPassword] = React.useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FirstLoginPasswordInput>({
    resolver: zodResolver(firstLoginPasswordSchema),
    defaultValues: { newPassword: '', confirmPassword: '' },
  });

  const password = watch('newPassword') ?? '';

  return (
    <div>
      <div className="mb-6 flex h-11 w-11 items-center justify-center rounded-xl bg-warning/15">
        <ShieldAlert className="h-5 w-5 text-warning" aria-hidden="true" />
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Choose a password</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Your current password is your USN — which is printed on your ID card and sits in every
          class list, so it is not a secret. Pick something only you know.
        </p>
      </div>

      <form
        onSubmit={handleSubmit((data) => firstLogin.mutate(data))}
        className="space-y-4"
        noValidate
      >
        <div className="space-y-2">
          <Label htmlFor="newPassword">New password</Label>

          <div className="relative">
            <Input
              id="newPassword"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              autoFocus
              error={Boolean(errors.newPassword)}
              className="pr-10"
              {...register('newPassword')}
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              className="absolute right-0 top-0 flex h-9 w-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          {password.length > 0 ? (
            <ul className="mt-2 grid grid-cols-2 gap-1.5">
              {RULES.map((rule) => {
                const met = rule.test(password);
                return (
                  <li
                    key={rule.label}
                    className={cn(
                      'flex items-center gap-1.5 text-xs transition-colors',
                      met ? 'text-success' : 'text-muted-foreground',
                    )}
                  >
                    <Check
                      className={cn('h-3 w-3 shrink-0', !met && 'opacity-30')}
                      strokeWidth={3}
                    />
                    {rule.label}
                  </li>
                );
              })}
            </ul>
          ) : null}

          {errors.newPassword ? (
            <p role="alert" className="text-xs text-destructive">
              {errors.newPassword.message}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirm password</Label>
          <Input
            id="confirmPassword"
            type={showPassword ? 'text' : 'password'}
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

        <Button type="submit" className="w-full" loading={firstLogin.isPending}>
          Set password and continue
        </Button>
      </form>

      <p className="mt-6 text-xs text-muted-foreground">
        Any other device signed in with your USN will be signed out.
      </p>
    </div>
  );
}
