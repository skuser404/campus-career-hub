'use client';

import { categoryInputSchema, type Category, type CategoryInput } from '@cch/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { MoreVertical, Pencil, Plus, Tags, Trash2 } from 'lucide-react';
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
import {
  useAdminCategories,
  useAdminTags,
  useDeleteCategory,
  useDeleteTag,
  useSaveCategory,
} from '@/hooks/use-admin';
import { Badge } from '@/components/ui/badge';

export default function AdminCategoriesPage() {
  const { data: categories, isLoading, isError, refetch } = useAdminCategories();
  const { data: tags } = useAdminTags();

  const removeCategory = useDeleteCategory();
  const removeTag = useDeleteTag();

  const [editing, setEditing] = React.useState<Category | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState<Category | null>(null);

  return (
    <div>
      <PageHeader
        title="Categories & tags"
        description="Categories group opportunities. Tags describe the skills involved."
        action={
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" />
            Add category
          </Button>
        }
      />

      <h2 className="mb-3 text-sm font-semibold">Categories</h2>

      {isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : isLoading ? (
        <TableSkeleton rows={5} cols={3} />
      ) : !categories || categories.length === 0 ? (
        <EmptyState
          icon={Tags}
          title="No categories"
          description="Categories are how students filter — Placement, Internship, Hackathon, and so on."
          action={
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" />
              Add category
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((cat) => (
            <div
              key={cat.id}
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-4"
            >
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-bold"
                style={{
                  backgroundColor: cat.color
                    ? `color-mix(in oklch, ${cat.color} 15%, transparent)`
                    : undefined,
                  color: cat.color ?? undefined,
                }}
                aria-hidden="true"
              >
                {cat.name.charAt(0)}
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{cat.name}</p>
                <p className="text-xs text-muted-foreground">{cat.jobCount ?? 0} published</p>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label={`Actions for ${cat.name}`}>
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>

                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setEditing(cat)}>
                    <Pencil /> Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem destructive onClick={() => setConfirmDelete(cat)}>
                    <Trash2 /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </div>
      )}

      <h2 className="mb-3 mt-10 text-sm font-semibold">Tags</h2>

      {tags && tags.length > 0 ? (
        <div className="flex flex-wrap gap-2 rounded-xl border border-border bg-card p-4">
          {tags.map((tag) => (
            <span
              key={tag.id}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs font-medium"
            >
              {tag.name}
              <button
                type="button"
                onClick={() => removeTag.mutate(tag.id)}
                disabled={removeTag.isPending}
                className="ml-0.5 text-muted-foreground transition-colors hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Delete tag ${tag.name}`}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
          No tags yet. Tags are created inline from the opportunity form.
        </p>
      )}

      <CategoryDialog
        key={editing?.id ?? 'new'}
        category={editing}
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
              If any opportunity still uses this category, the delete will be refused. Reassign
              them first.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              loading={removeCategory.isPending}
              onClick={() => {
                if (confirmDelete) {
                  removeCategory.mutate(confirmDelete.id, {
                    onSuccess: () => setConfirmDelete(null),
                  });
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

function CategoryDialog({
  category,
  open,
  onClose,
}: {
  category: Category | null;
  open: boolean;
  onClose: () => void;
}) {
  const save = useSaveCategory();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<CategoryInput>({
    resolver: zodResolver(categoryInputSchema),
    defaultValues: category
      ? {
          name: category.name,
          description: category.description ?? '',
          color: category.color ?? '#2563eb',
          icon: category.icon ?? '',
          sortOrder: category.sortOrder,
        }
      : { name: '', color: '#2563eb', sortOrder: 0 },
  });

  const color = watch('color');

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{category ? 'Edit category' : 'Add category'}</DialogTitle>
          <DialogDescription>
            The colour is used for the badge students see on every card.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit((data) =>
            save.mutate(
              { ...data, ...(category ? { id: category.id } : {}) },
              { onSuccess: onClose },
            ),
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

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="color">Colour</Label>
              <div className="flex gap-2">
                <input
                  id="color"
                  type="color"
                  className="h-9 w-12 shrink-0 cursor-pointer rounded-lg border border-input bg-background p-1"
                  {...register('color')}
                />
                <Input
                  value={color ?? ''}
                  readOnly
                  className="font-mono text-xs"
                  aria-label="Selected colour"
                />
              </div>
              {errors.color ? (
                <p role="alert" className="text-xs text-destructive">
                  {errors.color.message}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="sortOrder">Sort order</Label>
              <Input
                id="sortOrder"
                type="number"
                inputMode="numeric"
                {...register('sortOrder')}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" rows={2} {...register('description')} />
          </div>

          <div className="rounded-lg border border-border p-3">
            <p className="mb-2 text-xs text-muted-foreground">Preview</p>
            <Badge
              style={
                color
                  ? {
                      backgroundColor: `color-mix(in oklch, ${color} 12%, transparent)`,
                      color,
                    }
                  : undefined
              }
            >
              {watch('name') || 'Category'}
            </Badge>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending}>
              {category ? 'Save changes' : 'Add category'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
