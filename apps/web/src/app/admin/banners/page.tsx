'use client';

import { bannerInputSchema, type Banner, type BannerInput } from '@cch/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { Image as ImageIcon, Loader2, MoreVertical, Pencil, Plus, Trash2, Upload, X } from 'lucide-react';
import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
  DropdownMenuTrigger,
  Label,
  Switch,
} from '@/components/ui/primitives';
import { TableSkeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState, PageHeader } from '@/components/ui/states';
import { useAdminBanners, useDeleteBanner, useSaveBanner, useUploadImage } from '@/hooks/use-admin';
import { cn, formatDate } from '@/lib/utils';

const toLocalInput = (d: Date | string | null): string =>
  d ? new Date(d).toISOString().slice(0, 16) : '';

export default function AdminBannersPage() {
  const { data, isLoading, isError, refetch } = useAdminBanners();
  const remove = useDeleteBanner();

  const [editing, setEditing] = React.useState<Banner | null>(null);
  const [creating, setCreating] = React.useState(false);

  const banners = data?.items ?? [];

  return (
    <div>
      <PageHeader
        title="Banners"
        description="Promotional slots on the landing page. Ordered by sort value, lowest first."
        action={
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" />
            Add banner
          </Button>
        }
      />

      {isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : isLoading ? (
        <TableSkeleton rows={3} cols={3} />
      ) : banners.length === 0 ? (
        <EmptyState
          icon={ImageIcon}
          title="No banners"
          description="Banners are the first thing a student sees on the landing page."
          action={
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" />
              Add banner
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {banners.map((banner) => (
            <div
              key={banner.id}
              className="overflow-hidden rounded-xl border border-border bg-card"
            >
              <div className="relative aspect-[21/9]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={banner.imageUrl} alt="" className="h-full w-full object-cover" />

                {!banner.isActive ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/70">
                    <Badge variant="muted">Inactive</Badge>
                  </div>
                ) : null}
              </div>

              <div className="flex items-start gap-2 p-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{banner.title}</p>
                  <p className="text-xs text-muted-foreground">
                    Order {banner.sortOrder}
                    {banner.endsAt ? ` · until ${formatDate(banner.endsAt)}` : ''}
                  </p>
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label={`Actions for ${banner.title}`}>
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>

                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setEditing(banner)}>
                      <Pencil /> Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      destructive
                      onClick={() => remove.mutate(banner.id)}
                      disabled={remove.isPending}
                    >
                      <Trash2 /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))}
        </div>
      )}

      <BannerDialog
        key={editing?.id ?? 'new'}
        banner={editing}
        open={creating || editing !== null}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />
    </div>
  );
}

function BannerDialog({
  banner,
  open,
  onClose,
}: {
  banner: Banner | null;
  open: boolean;
  onClose: () => void;
}) {
  const save = useSaveBanner();
  const upload = useUploadImage();

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors },
  } = useForm<BannerInput>({
    resolver: zodResolver(bannerInputSchema),
    defaultValues: banner
      ? {
          title: banner.title,
          imageUrl: banner.imageUrl,
          linkUrl: banner.linkUrl ?? '',
          sortOrder: banner.sortOrder,
          isActive: banner.isActive,
          startsAt: toLocalInput(banner.startsAt) as unknown as Date,
          endsAt: toLocalInput(banner.endsAt) as unknown as Date,
        }
      : { title: '', imageUrl: '', sortOrder: 0, isActive: true },
  });

  const imageUrl = watch('imageUrl');

  const handleUpload = async (file: File) => {
    const url = await upload.mutateAsync({ file, folder: 'banners' });
    setValue('imageUrl', url, { shouldValidate: true });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{banner ? 'Edit banner' : 'Add banner'}</DialogTitle>
          <DialogDescription>Recommended aspect ratio is 21:9.</DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit((data) =>
            save.mutate(
              { ...data, ...(banner ? { id: banner.id } : {}) },
              { onSuccess: onClose },
            ),
          )}
          className="space-y-4"
          noValidate
        >
          {imageUrl ? (
            <div className="relative overflow-hidden rounded-lg border border-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl} alt="" className="aspect-[21/9] w-full object-cover" />
              <Button
                type="button"
                variant="destructive"
                size="icon"
                className="absolute right-2 top-2 h-7 w-7"
                onClick={() => setValue('imageUrl', '', { shouldValidate: true })}
                aria-label="Remove image"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <label
              className={cn(
                'flex aspect-[21/9] cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border transition-colors',
                'hover:border-primary hover:bg-accent/50',
                errors.imageUrl && 'border-destructive',
              )}
            >
              {upload.isPending ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : (
                <>
                  <Upload className="h-5 w-5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Upload an image</span>
                </>
              )}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                disabled={upload.isPending}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleUpload(file);
                }}
              />
            </label>
          )}

          <div className="space-y-2">
            <Label htmlFor="imageUrl">
              Image URL <span className="text-destructive">*</span>
            </Label>
            <Input
              id="imageUrl"
              type="url"
              placeholder="https://…"
              error={Boolean(errors.imageUrl)}
              {...register('imageUrl')}
            />
            {errors.imageUrl ? (
              <p role="alert" className="text-xs text-destructive">
                {errors.imageUrl.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="title">
              Title <span className="text-destructive">*</span>
            </Label>
            <Input id="title" error={Boolean(errors.title)} {...register('title')} />
            {errors.title ? (
              <p role="alert" className="text-xs text-destructive">
                {errors.title.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="linkUrl">Link</Label>
            <Input
              id="linkUrl"
              placeholder="/opportunities?category=placement"
              error={Boolean(errors.linkUrl)}
              {...register('linkUrl')}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="sortOrder">Sort order</Label>
              <Input id="sortOrder" type="number" inputMode="numeric" {...register('sortOrder')} />
            </div>

            <div className="space-y-2">
              <Label>Active</Label>
              <div className="flex h-9 items-center">
                <Controller
                  name="isActive"
                  control={control}
                  render={({ field }) => (
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      aria-label="Active"
                    />
                  )}
                />
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="startsAt">Starts</Label>
              <Input id="startsAt" type="datetime-local" {...register('startsAt')} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="endsAt">Ends</Label>
              <Input
                id="endsAt"
                type="datetime-local"
                error={Boolean(errors.endsAt)}
                {...register('endsAt')}
              />
              {errors.endsAt ? (
                <p role="alert" className="text-xs text-destructive">
                  {errors.endsAt.message}
                </p>
              ) : null}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending}>
              {banner ? 'Save changes' : 'Add banner'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
