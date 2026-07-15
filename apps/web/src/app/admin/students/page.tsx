'use client';

import { ACADEMIC_YEARS, YEAR_LABELS, type PublicUser } from '@cch/shared';
import {
  AlertTriangle,
  KeyRound,
  MoreHorizontal,
  Search,
  ShieldOff,
  Trash2,
  Upload,
  UserCheck,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/primitives';
import { TableSkeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState, PageHeader } from '@/components/ui/states';
import {
  useAdminDepartments,
  useAdminStudents,
  useDeleteStudent,
  useResetStudentPassword,
  useSetStudentStatus,
} from '@/hooks/use-admin';
import { useCurrentUser } from '@/hooks/use-auth';
import { formatRelative } from '@/lib/utils';

const ALL = '__all__';

export default function AdminStudentsPage() {
  const { data: me } = useCurrentUser();
  const { data: departments } = useAdminDepartments();

  const [q, setQ] = React.useState('');
  const [debouncedQ, setDebouncedQ] = React.useState('');
  const [departmentId, setDepartmentId] = React.useState<string>(ALL);
  const [year, setYear] = React.useState<string>(ALL);
  const [pending, setPending] = React.useState(false);
  const [page, setPage] = React.useState(1);

  // Debounced, so typing a name does not fire a query per keystroke against a
  // 1,400-row table.
  React.useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQ(q);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const { data, isLoading, isError, refetch } = useAdminStudents({
    page,
    limit: 20,
    q: debouncedQ || undefined,
    departmentId: departmentId === ALL ? undefined : departmentId,
    year: year === ALL ? undefined : (Number(year) as never),
    pendingPasswordChange: pending ? ('true' as never) : undefined,
    sort: 'newest',
  });

  const resetPassword = useResetStudentPassword();
  const setStatus = useSetStudentStatus();
  const deleteStudent = useDeleteStudent();

  const [confirmDelete, setConfirmDelete] = React.useState<PublicUser | null>(null);

  const students = data?.items ?? [];
  const total = data?.pagination.total ?? 0;

  return (
    <div>
      <PageHeader
        title="Students"
        description={`${total} account${total === 1 ? '' : 's'}. Accounts can only be created here or by import — there is no self-service signup.`}
        action={
          <Button asChild>
            <Link href="/admin/students/import">
              <Upload className="h-4 w-4" />
              Import from Excel
            </Link>
          </Button>
        }
      />

      {/* ── Filters ─────────────────────────────────────────────────────── */}
      <Card className="mb-6">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name, USN or email…"
              className="pl-9"
              aria-label="Search students"
            />
          </div>

          <Select
            value={departmentId}
            onValueChange={(v) => {
              setDepartmentId(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="sm:w-44" aria-label="Filter by department">
              <SelectValue placeholder="Department" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All departments</SelectItem>
              {departments?.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.code} · {d.studentCount ?? 0}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={year}
            onValueChange={(v) => {
              setYear(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="sm:w-32" aria-label="Filter by year">
              <SelectValue placeholder="Year" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All years</SelectItem>
              {ACADEMIC_YEARS.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {YEAR_LABELS[y]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/*
            The security-risk filter.

            A student who has never replaced their USN default is holding a
            password that is printed on their ID card. Making that list one click
            away is the difference between knowing about the risk and discovering
            it after an incident.
          */}
          <Button
            variant={pending ? 'default' : 'outline'}
            onClick={() => {
              setPending((p) => !p);
              setPage(1);
            }}
            aria-pressed={pending}
            className="shrink-0"
          >
            <AlertTriangle className="h-4 w-4" />
            Still using USN
          </Button>
        </CardContent>
      </Card>

      {/* ── Table ───────────────────────────────────────────────────────── */}
      {isLoading ? (
        <TableSkeleton rows={8} cols={6} />
      ) : isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : students.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No students found"
          description={
            debouncedQ || departmentId !== ALL || year !== ALL || pending
              ? 'No student matches those filters.'
              : 'Import your student roll from an Excel or CSV file to get started.'
          }
          action={
            <Button asChild>
              <Link href="/admin/students/import">
                <Upload className="h-4 w-4" />
                Import students
              </Link>
            </Button>
          }
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">Student</th>
                  <th className="px-4 py-3 font-medium">USN</th>
                  <th className="px-4 py-3 font-medium">Department</th>
                  <th className="px-4 py-3 font-medium">Year</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Last seen</th>
                  <th className="w-12 px-4 py-3" />
                </tr>
              </thead>

              <tbody>
                {students.map((s) => {
                  const isSelf = s.id === me?.id;

                  return (
                    <tr key={s.id} className="border-t border-border">
                      <td className="px-4 py-3">
                        <div className="font-medium">{s.fullName}</div>
                        <div className="text-xs text-muted-foreground">{s.email}</div>
                      </td>

                      <td className="px-4 py-3 font-mono text-xs">{s.usn ?? '—'}</td>

                      <td className="px-4 py-3">
                        {s.department ? (
                          <Badge variant="secondary">{s.department.code}</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">None</span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-muted-foreground">
                        {s.year ? `Year ${s.year}` : '—'}
                        {s.section ? ` · ${s.section}` : ''}
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {s.role === 'admin' ? <Badge>Admin</Badge> : null}

                          {!s.isActive ? (
                            <Badge variant="destructive">Disabled</Badge>
                          ) : s.mustChangePassword ? (
                            // Not decoration: this account's password is its USN,
                            // which is public information.
                            <Badge variant="warning" className="gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              Using USN
                            </Badge>
                          ) : (
                            <Badge variant="success">Active</Badge>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {s.lastLoginAt ? formatRelative(s.lastLoginAt) : 'Never'}
                      </td>

                      <td className="px-4 py-3">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Actions for ${s.fullName}`}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>

                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => resetPassword.mutate(s.id)}
                              disabled={!s.usn}
                            >
                              <KeyRound /> Reset password to USN
                            </DropdownMenuItem>

                            <DropdownMenuItem
                              onClick={() =>
                                setStatus.mutate({ id: s.id, isActive: !s.isActive })
                              }
                              // An admin disabling themselves would lock the
                              // university out of its own console. The API refuses
                              // it too; this just stops them trying.
                              disabled={isSelf}
                            >
                              {s.isActive ? (
                                <>
                                  <ShieldOff /> Disable account
                                </>
                              ) : (
                                <>
                                  <UserCheck /> Enable account
                                </>
                              )}
                            </DropdownMenuItem>

                            <DropdownMenuSeparator />

                            <DropdownMenuItem
                              destructive
                              onClick={() => setConfirmDelete(s)}
                              disabled={isSelf}
                            >
                              <Trash2 /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {data && data.pagination.totalPages > 1 ? (
            <div className="mt-6 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Page {data.pagination.page} of {data.pagination.totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!data.pagination.hasPrev}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!data.pagination.hasNext}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}

      {/* ── Delete confirmation ─────────────────────────────────────────── */}
      <Dialog open={Boolean(confirmDelete)} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {confirmDelete?.fullName}?</DialogTitle>
            <DialogDescription>
              This permanently removes their account, along with every opportunity they saved and
              every application they recorded. It cannot be undone.
              <br />
              <br />
              If you only want to stop them signing in, <strong>disable</strong> the account
              instead — that keeps their history.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              loading={deleteStudent.isPending}
              onClick={() => {
                if (!confirmDelete) return;
                deleteStudent.mutate(confirmDelete.id, {
                  onSuccess: () => setConfirmDelete(null),
                });
              }}
            >
              Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
