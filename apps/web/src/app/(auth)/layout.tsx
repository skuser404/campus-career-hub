import { Check, GraduationCap } from 'lucide-react';
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

      {/*
        The welcome panel. Hidden below lg — on a phone it would push the form
        below the fold.

        A SOLID warm coral panel with a fine dot grid, not the gradient-blur blobs
        every generated login screen ships. The panel commits to the brand colour
        instead of hedging with a faint tint, which is what makes it read as
        designed rather than defaulted.
      */}
      <aside
        className="relative hidden overflow-hidden bg-primary text-primary-foreground lg:flex lg:flex-col lg:justify-between lg:p-16"
        aria-hidden="true"
      >
        {/* A subtle dot grid — texture, not noise. Masked so it fades toward the
            edges rather than stopping in a hard line. */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage: 'radial-gradient(currentColor 1px, transparent 1px)',
            backgroundSize: '22px 22px',
            maskImage: 'radial-gradient(ellipse at center, black 40%, transparent 85%)',
          }}
        />

        <div className="relative flex items-center gap-2 text-sm font-medium">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15">
            <GraduationCap className="h-4 w-4" />
          </span>
          Jain University
        </div>

        <div className="relative max-w-md">
          <h2 className="text-[2.5rem] font-extrabold leading-[1.05]">
            Every opportunity,
            <br />
            meant for you.
          </h2>

          <p className="mt-5 text-lg text-primary-foreground/85">
            Placements, internships, hackathons and more — filtered to your department and year,
            sorted by deadline, tracked from the moment you apply.
          </p>

          <ul className="mt-9 space-y-3.5 text-[0.95rem]">
            {[
              'Only what you are actually eligible for',
              'Save it, and watch the deadline count down',
              'Mark as applied — never wonder again',
            ].map((line) => (
              <li key={line} className="flex items-center gap-3">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/20">
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
                <span className="text-primary-foreground/90">{line}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative text-sm text-primary-foreground/70">
          Built for 1,400 students who were tired of scrolling WhatsApp.
        </div>
      </aside>
    </div>
  );
}
