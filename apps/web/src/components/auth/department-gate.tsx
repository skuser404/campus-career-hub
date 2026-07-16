'use client';

import { GraduationCap } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/primitives';
import { useCurrentUser, useSetDepartment } from '@/hooks/use-auth';
import { useDepartments } from '@/hooks/use-reports';
import { cn } from '@/lib/utils';

/**
 * Asks a student which branch they are in, once.
 *
 * Google tells us a name and an email and nothing about the branch, so we have to
 * ask. This blocks until answered because a student with no department only sees
 * university-wide postings — an empty-looking site that would read as broken.
 *
 * It cannot be dismissed (no close button, no escape) precisely because skipping
 * it leaves the student in that broken-looking state. It is asked once: after
 * this, only an admin can change it.
 */
export function DepartmentGate() {
  const { data: user } = useCurrentUser();
  const { data: departments } = useDepartments();
  const setDepartment = useSetDepartment();
  const [selected, setSelected] = React.useState<string | null>(null);

  // Admins have no department by design, and a student who has already chosen is
  // done. Only an unset student sees this.
  const needsDepartment = Boolean(user && user.role === 'student' && !user.department);

  if (!needsDepartment) return null;

  return (
    <Dialog open>
      <DialogContent
        className="max-w-md [&>button]:hidden"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
            <GraduationCap className="h-5 w-5 text-primary" aria-hidden="true" />
          </div>
          <DialogTitle>Which department are you in?</DialogTitle>
          <DialogDescription>
            We&rsquo;ll show you the opportunities meant for your branch. You can only set this
            once — ask the placement office if it ever needs changing.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2">
          {departments?.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => setSelected(d.id)}
              aria-pressed={selected === d.id}
              className={cn(
                'rounded-lg border p-3 text-left transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                selected === d.id
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-foreground/30',
              )}
            >
              <span className="block text-sm font-semibold">{d.code}</span>
              <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                {d.name}
              </span>
            </button>
          ))}
        </div>

        <Button
          className="mt-2 w-full"
          disabled={!selected}
          loading={setDepartment.isPending}
          onClick={() => selected && setDepartment.mutate(selected)}
        >
          Continue
        </Button>
      </DialogContent>
    </Dialog>
  );
}
