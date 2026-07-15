import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono, Plus_Jakarta_Sans } from 'next/font/google';
import { Providers } from '@/providers';
import './globals.css';

// Body text. Clean, neutral, highly legible at small sizes.
const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
  display: 'swap',
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
  display: 'swap',
});

/**
 * Headings. Plus Jakarta Sans has a rounder, warmer letterform than Geist —
 * friendly without tipping into childish. Using a display face distinct from the
 * body is one of the clearest signals of a designed page rather than a generated
 * one, where everything is set in a single default sans.
 */
const displayFont = Plus_Jakarta_Sans({
  variable: '--font-display',
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  display: 'swap',
});

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? 'Campus Career Hub';

export const metadata: Metadata = {
  title: {
    default: `${APP_NAME} — Every opportunity, in one place`,
    template: `%s · ${APP_NAME}`,
  },
  description:
    'Placements, internships, hackathons, certifications and events — searchable, deadline-aware, and tracked. Stop losing opportunities in WhatsApp.',
  keywords: ['placements', 'internships', 'hackathons', 'campus', 'jobs', 'students'],
  openGraph: {
    title: APP_NAME,
    description: 'Every campus opportunity, in one place. Never miss a deadline again.',
    type: 'website',
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0b' },
  ],
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    /**
     * `suppressHydrationWarning` is required, not lazy.
     *
     * next-themes writes the `class` and `style` attributes on <html> in a
     * blocking inline script BEFORE React hydrates — that is what prevents a
     * flash of the wrong theme. React then sees markup that differs from what
     * the server sent and would warn about it. The mismatch is the mechanism,
     * so the warning is suppressed on this element only.
     */
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${displayFont.variable} font-sans antialiased`}
      >
        {/* First tab stop on the page. Someone navigating by keyboard should not
            have to walk the entire nav to reach the content. */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"
        >
          Skip to content
        </a>

        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
