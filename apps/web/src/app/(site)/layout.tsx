import Link from 'next/link';
import { DepartmentGate } from '@/components/auth/department-gate';
import { Navbar } from '@/components/layout/navbar';

/**
 * The shell for every page that is not an auth screen: landing, opportunities,
 * dashboard, saved, applications, profile, settings.
 *
 * `flex-1` on <main> pins the footer to the bottom of the viewport even on a
 * short page — otherwise an empty state leaves the footer floating mid-screen.
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Blocks a student with no department yet — they would otherwise see an
          almost-empty site and think it was broken. */}
      <DepartmentGate />

      <Navbar />

      <main id="main" className="flex-1">
        {children}
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row sm:px-6 lg:px-8">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} Campus Career Hub
          </p>

          <nav className="flex gap-6 text-sm text-muted-foreground" aria-label="Footer">
            <Link href="/opportunities" className="transition-colors hover:text-foreground">
              Opportunities
            </Link>
            <Link href="/login" className="transition-colors hover:text-foreground">
              Sign in
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
