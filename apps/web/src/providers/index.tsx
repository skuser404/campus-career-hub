'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider as NextThemeProvider } from 'next-themes';
import * as React from 'react';
import { Toaster } from 'sonner';
import { ApiError } from '@/lib/api';

/**
 * The query client.
 *
 * Created inside a `useState` initialiser rather than at module scope. At module
 * scope the client would be a singleton shared by every request the server
 * handles — so one user's cached dashboard could be served to the next. Per-
 * component means per-request on the server and per-tab in the browser.
 */
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,

        retry(failureCount, error) {
          // Retrying a 401/403/404 is pointless — the answer will not change,
          // and on a 401 the api client has already tried refreshing the session.
          if (error instanceof ApiError) {
            if (error.status >= 400 && error.status < 500) return false;
          }
          return failureCount < 2;
        },
      },
      mutations: {
        // Never auto-retry a mutation. A retried POST /applications is a
        // duplicate application, not a recovered one.
        retry: false,
      },
    },
  });
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(makeQueryClient);

  return (
    <NextThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      // Without this, every element transitions colour on a theme switch and
      // the whole page appears to melt for 200ms.
      disableTransitionOnChange
    >
      <QueryClientProvider client={queryClient}>
        {children}
        <Toaster
          position="bottom-right"
          richColors
          closeButton
          toastOptions={{
            classNames: {
              toast: 'rounded-lg border border-border',
            },
          }}
        />
      </QueryClientProvider>
    </NextThemeProvider>
  );
}
