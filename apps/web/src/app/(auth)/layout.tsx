import { GraduationCap } from 'lucide-react';
import { ThemeToggle } from '@/components/layout/theme-toggle';

/**
 * A split layout: the form on the left, and on the right the reason it exists.
 *
 * No "create an account" link anywhere, because there is no such thing — accounts
 * come from the placement office's import. Offering a signup link that leads
 * nowhere would be worse than offering none.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative flex flex-col">
        <header className="flex items-center justify-between p-6">
          <div className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <GraduationCap className="h-4 w-4" />
            </span>
            Campus Career Hub
          </div>
          <ThemeToggle />
        </header>

        <main id="main" className="flex flex-1 items-center justify-center px-6 pb-16">
          <div className="w-full max-w-sm">{children}</div>
        </main>
      </div>

      {/* Decorative, and hidden below lg — on a phone this would push the actual
          form below the fold. */}
      <aside
        className="relative hidden overflow-hidden border-l border-border bg-muted/30 lg:flex lg:flex-col lg:justify-center lg:px-16"
        aria-hidden="true"
      >
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-primary/5 blur-3xl" />

        <div className="relative max-w-md">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
            Jain University · Placement Office
          </div>

          <h2 className="text-3xl font-semibold leading-tight tracking-tight">
            Stop losing opportunities in a WhatsApp group.
          </h2>

          <p className="mt-4 text-muted-foreground">
            Placements, internships, hackathons, certifications, workshops and events — filtered to
            your department and year, sorted by deadline, and tracked from the moment you apply.
          </p>

          <ul className="mt-8 space-y-3 text-sm">
            {[
              'Only the opportunities you are actually eligible for',
              'Save what matters and watch the deadline countdown',
              'Mark as applied, and never wonder again',
            ].map((line) => (
              <li key={line} className="flex items-start gap-2.5">
                <span className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/15">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                </span>
                <span className="text-muted-foreground">{line}</span>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
