'use client';

import { COLLEGE_EMAIL_DOMAIN, loginSchema, type LoginInput } from '@cch/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, Info } from 'lucide-react';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { GoogleButton } from '@/components/auth/google-button';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/primitives';
import { useLogin } from '@/hooks/use-auth';

export default function LoginPage() {
  const login = useLogin();
  const [showPassword, setShowPassword] = React.useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    // The SAME schema the API validates against — including the college-domain
    // rule. There is no second definition of "valid credentials" to drift.
    resolver: zodResolver(loginSchema),
  });

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Use your Jain University account.
        </p>
      </div>

      {/* Students sign in here with one tap. Renders nothing if Google is not
          configured, leaving a clean password-only page. */}
      <div className="mb-6">
        <GoogleButton />
      </div>

      <form onSubmit={handleSubmit((data) => login.mutate(data))} className="space-y-4" noValidate>
        <div className="space-y-2">
          <Label htmlFor="email">College email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="username"
            autoFocus
            placeholder={`you@${COLLEGE_EMAIL_DOMAIN}`}
            error={Boolean(errors.email)}
            aria-describedby={errors.email ? 'email-error' : undefined}
            {...register('email')}
          />
          {errors.email ? (
            <p id="email-error" role="alert" className="text-xs text-destructive">
              {errors.email.message}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>

          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="••••••••"
              error={Boolean(errors.password)}
              className="pr-10"
              {...register('password')}
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

          {errors.password ? (
            <p role="alert" className="text-xs text-destructive">
              {errors.password.message}
            </p>
          ) : null}
        </div>

        <Button type="submit" className="w-full" loading={login.isPending}>
          Sign in
        </Button>
      </form>

      {/* First-timers will otherwise have no idea what their password is. This
          one note prevents most of the support traffic a system like this
          generates in its first week. */}
      <div className="mt-6 flex gap-2.5 rounded-lg border border-border bg-muted/40 p-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="text-xs text-muted-foreground">
          <p className="font-medium text-foreground">Signing in for the first time?</p>
          <p className="mt-0.5">
            Your password is your <span className="font-medium">USN</span> (for example{' '}
            <code className="rounded bg-background px-1 py-0.5 font-mono">22BTRCS001</code>). You
            will be asked to choose a new one straight away.
          </p>
        </div>
      </div>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Accounts are created by the placement office. If you cannot sign in, contact them.
      </p>
    </div>
  );
}
