'use client';

import { departmentInputSchema, type DepartmentInput } from '@cch/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { Building2, Plus, Trash2 } from 'lucide-react';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
} from '@/components/ui/primitives';
import { TableSkeleton } from '@/components/ui/skeleton';
import { EmptyState, PageHeader } from '@/components/ui/states';
import {
  useAdminDepartments,
  useCreateDepartment,
  useDeleteDepartment,
} from '@/hooks/use-admin';

/**
 * Departments.
 *
 * These are not a taxonomy — they are the access-control dimension the whole
 * system turns on. A student's department decides which opportunities they can
 * see; an opportunity's departments decide who can see it.
 */
export default function AdminDepartmentsPage() {
  const { data: departments, isLoading } = useAdminDepartments();
  const create = useCreateDepartment();
  const remove = useDeleteDepartment();

  const [open, setOpen] = React.useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<DepartmentInput>({
    resolver: zodResolver(departmentInputSchema),
    defaultValues: { sortOrder: 0 },
  });

  const onSubmit = (data: DepartmentInput) => {
    create.mutate(data, {
      onSuccess: () => {
        reset();
        setOpen(false);
      },
    });
  };

  return (
    <div>
      <PageHeader
        title="Departments"
        description="A student's department decides which opportunities they can see. Codes here must match the ones in your import file."
        action={
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" />
            Add department
          </Button>
        }
      />

      {isLoading ? (
        <TableSkeleton rows={6} cols={4} />
      ) : !departments || departments.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No departments yet"
          description="Add a department before importing students — the import matches on department code."
          action={
            <Button onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" />
              Add department
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Code</th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Students</th>
                <th className="px-4 py-3 font-medium">Open opportunities</th>
                <th className="w-12 px-4 py-3" />
              </tr>
            </thead>

            <tbody>
              {departments.map((d) => (
                <tr key={d.id} className="border-t border-border">
                  <td className="px-4 py-3">
                    <Badge variant="secondary" className="font-mono">
                      {d.code}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 font-medium">{d.name}</td>
                  <td className="px-4 py-3 tabular-nums text-muted-foreground">
                    {d.studentCount ?? 0}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-muted-foreground">
                    {d.jobCount ?? 0}
                  </td>
                  <td className="px-4 py-3">
                    <Button
                      variant="ghost"
                      size="icon"
                      // Deleting a department that still has students would orphan
                      // them — and an orphaned student has no department, so the
                      // eligibility filter would silently stop showing them their
                      // own branch's postings. The API refuses it; this disables
                      // the button so nobody has to discover that by trying.
                      disabled={(d.studentCount ?? 0) > 0 || remove.isPending}
                      title={
                        (d.studentCount ?? 0) > 0
                          ? 'Reassign its students first'
                          : 'Delete department'
                      }
                      onClick={() => remove.mutate(d.id)}
                      aria-label={`Delete ${d.name}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add department</DialogTitle>
            <DialogDescription>
              The code is what your import file will reference — make it match exactly.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="code">Code</Label>
              <Input
                id="code"
                placeholder="CSE"
                className="font-mono uppercase"
                error={Boolean(errors.code)}
                {...register('code')}
              />
              {errors.code ? (
                <p role="alert" className="text-xs text-destructive">
                  {errors.code.message}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                placeholder="Computer Science & Engineering"
                error={Boolean(errors.name)}
                {...register('name')}
              />
              {errors.name ? (
                <p role="alert" className="text-xs text-destructive">
                  {errors.name.message}
                </p>
              ) : null}
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={create.isPending}>
                Add department
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
