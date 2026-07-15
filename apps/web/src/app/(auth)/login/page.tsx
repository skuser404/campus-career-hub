'use client';

import { COLLEGE_EMAIL_DOMAIN } from '@cch/shared';
import { Info } from 'lucide-react';
import { GoogleButton } from '@/components/auth/google-button';

/**
 * The login screen: one button, nothing else.
 *
 * There is no email/password form. Students — and admins, via the ADMIN_EMAILS
 * allowlist on the server — sign in only with a `@jainuniversity.ac.in` Google
 * account, and an account that has never signed in is created automatically. So
 * there is nothing to type and nothing to register.
 */
export default function LoginPage() {
  return (
    <div className="text-center">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Continue with your Jain University Google account.
        </p>
      </div>

      <div className="flex justify-center">
        <GoogleButton />
      </div>

      <div className="mt-8 flex gap-2.5 rounded-lg border border-border bg-muted/40 p-3 text-left">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="text-xs text-muted-foreground">
          <p className="font-medium text-foreground">First time here?</p>
          <p className="mt-0.5">
            No sign-up needed. The first time you continue with your{' '}
            <span className="font-medium">@{COLLEGE_EMAIL_DOMAIN}</span> account, your profile is
            created for you and you go straight to your dashboard.
          </p>
        </div>
      </div>

      <p className="mt-6 text-xs text-muted-foreground">
        Only <span className="font-medium">@{COLLEGE_EMAIL_DOMAIN}</span> accounts can sign in.
      </p>
    </div>
  );
}
