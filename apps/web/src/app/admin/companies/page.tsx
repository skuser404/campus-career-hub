'use client';

import { companyInputSchema, type Company, type CompanyInput } from '@cch/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { Building2, ExternalLink, MoreVertical, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
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
  DropdownMenuTrigger,
  Label,
} from '@/components/ui/primitives';
import { TableSkeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState, PageHeader } from '@/components/ui/states';
import { useAdminCompanies, useDeleteCompany, useSaveCompany } from '@/hooks/use-admin';

export default function AdminCompaniesPage() {
  const [search, setSearch] = React.useState('');
  const [debounced, setDebounced] = React.useState('');
  const [editing, setEditing] = React.useState<Company | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState<Company | null>(null);

  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading, isError, refetch } = useAdminCompanies(
    debounced ? { q: debounced } : {},
  );
  const remove = useDeleteCompany();

  const companies = data?.items ?? [];

  return (
    <div>
      <PageHeader
        title="Companies"
        description="Every opportunity belongs to a company. Add them here first."
        action={
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" />
            Add company
          </Button>
        }
      />

      <div className="relative mb-4 max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search companies…"
          className="pl-9"
          aria-label="Search companies"
        />
      </div>

      {isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : isLoading ? (
        <TableSkeleton rows={6} cols={4} />
      ) : companies.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={debounced ? 'No matches' : 'No companies yet'}
          description={
            debounced
              ? 'Try a different search.'
              : 'Add a company, then create opportunities under it.'
          }
          action={
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" />
              Add company
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {companies.map((company) => (
            <div key={company.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start gap-3">
                {company.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={company.logoUrl}
                    alt=""
                    className="h-10 w-10 shrink-0 rounded-lg border border-border object-contain p-1"
                  />
                ) : (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-sm font-semibold text-muted-foreground">
                    {company.name.charAt(0)}
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{company.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {company.jobCount ?? 0} published
                  </p>
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label={`Actions for ${company.name}`}>
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>

                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setEditing(company)}>
                      <Pencil /> Edit
                    </DropdownMenuItem>

                    {company.website ? (
                      <DropdownMenuItem asChild>
                        <a href={company.website} target="_blank" rel="noopener noreferrer">
                          <ExternalLink /> Visit website
                        </a>
                      </DropdownMenuItem>
                    ) : null}

                    <DropdownMenuItem destructive onClick={() => setConfirmDelete(company)}>
                      <Trash2 /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {company.description ? (
                <p className="mt-3 line-clamp-2 text-xs text-muted-foreground">
                  {company.description}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      )}

      <CompanyDialog
        key={editing?.id ?? 'new'}
        company={editing}
        open={creating || editing !== null}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />

      <Dialog open={confirmDelete !== null} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {confirmDelete?.name}?</DialogTitle>
            <DialogDescription>
              {/* The API enforces this with ON DELETE RESTRICT and returns a 409,
                  so the warning is not merely advisory — the delete will fail. */}
              If this company still has opportunities, the delete will be refused. Remove or
              reassign them first.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              loading={remove.isPending}
              onClick={() => {
                if (confirmDelete) {
                  remove.mutate(confirmDelete.id, { onSuccess: () => setConfirmDelete(null) });
                }
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CompanyDialog({
  company,
  open,
  onClose,
}: {
  company: Company | null;
  open: boolean;
  onClose: () => void;
}) {
  const save = useSaveCompany();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CompanyInput>({
    resolver: zodResolver(companyInputSchema),
    defaultValues: company
      ? {
          name: company.name,
          logoUrl: company.logoUrl ?? '',
          website: company.website ?? '',
          description: company.description ?? '',
        }
      : { name: '' },
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{company ? 'Edit company' : 'Add company'}</DialogTitle>
          <DialogDescription>
            {company
              ? 'Changes apply to every opportunity under this company.'
              : 'You can create opportunities under it straight away.'}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit((data) =>
            save.mutate({ ...data, ...(company ? { id: company.id } : {}) }, { onSuccess: onClose }),
          )}
          className="space-y-4"
          noValidate
        >
          <div className="space-y-2">
            <Label htmlFor="name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input id="name" error={Boolean(errors.name)} {...register('name')} />
            {errors.name ? (
              <p role="alert" className="text-xs text-destructive">
                {errors.name.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="website">Website</Label>
            <Input
              id="website"
              type="url"
              placeholder="https://…"
              error={Boolean(errors.website)}
              {...register('website')}
            />
            {errors.website ? (
              <p role="alert" className="text-xs text-destructive">
                {errors.website.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="logoUrl">Logo URL</Label>
            <Input
              id="logoUrl"
              type="url"
              placeholder="https://…"
              error={Boolean(errors.logoUrl)}
              {...register('logoUrl')}
            />
            {errors.logoUrl ? (
              <p role="alert" className="text-xs text-destructive">
                {errors.logoUrl.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" rows={3} {...register('description')} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending}>
              {company ? 'Save changes' : 'Add company'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
