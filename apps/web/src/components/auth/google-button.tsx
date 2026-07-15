'use client';

import * as React from 'react';
import { useGoogleLogin } from '@/hooks/use-auth';

/**
 * "Sign in with Google", rendered by Google Identity Services.
 *
 * The button is drawn by Google's own script into a container we provide, which
 * is why this is imperative rather than declarative JSX. Google hands us a signed
 * ID token in the callback; we forward it to the API and let the server decide
 * whether the person is on the roll.
 *
 * Renders NOTHING when no Client ID is configured — so the login page degrades to
 * password-only rather than showing a dead button.
 */

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

// Minimal shape of the global `google.accounts.id` API we use.
interface GoogleId {
  initialize: (config: {
    client_id: string;
    callback: (response: { credential: string }) => void;
  }) => void;
  renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

function loadGoogleScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve();

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Google script failed to load')));
      return;
    }

    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Google script failed to load'));
    document.head.appendChild(script);
  });
}

export function GoogleButton() {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const googleLogin = useGoogleLogin();
  const [ready, setReady] = React.useState(false);

  // Keep the latest mutate in a ref so the Google callback — captured once at
  // init — always calls the current one rather than a stale closure.
  const loginRef = React.useRef(googleLogin.mutate);
  loginRef.current = googleLogin.mutate;

  React.useEffect(() => {
    if (!CLIENT_ID) return;

    let cancelled = false;

    loadGoogleScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.google) return;

        window.google.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: (response) => loginRef.current(response.credential),
        });

        window.google.accounts.id.renderButton(containerRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'signin_with',
          shape: 'pill',
          logo_alignment: 'center',
          width: 320,
        });

        setReady(true);
      })
      .catch(() => {
        // A blocked script (ad-blocker, offline) must not break the page — the
        // password login below still works.
        setReady(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // No Client ID → render nothing, so the page is cleanly password-only.
  if (!CLIENT_ID) return null;

  return (
    <div className="space-y-4">
      <div className="flex justify-center">
        {/* Google draws its button in here. The min-height reserves the space so
            the form does not jump when the button finishes loading. */}
        <div ref={containerRef} className="min-h-[44px]" aria-busy={!ready} />
      </div>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-background px-2 text-muted-foreground">or sign in with email</span>
        </div>
      </div>
    </div>
  );
}
