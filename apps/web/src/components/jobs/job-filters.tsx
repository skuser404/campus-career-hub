'use client';

import { JOB_MODES, JOB_MODE_LABELS, JOB_SORT_LABELS, JOB_SORT_OPTIONS } from '@cch/shared';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
} from '@/components/ui/primitives';
import { useCategories, useTags } from '@/hooks/use-jobs';
import { cn } from '@/lib/utils';

export interface FilterState {
  q: string;
  category: string;
  mode: string;
  tags: string[];
  sort: string;
  closingSoon: boolean;
  /** Viewing the Closed (past-deadline) opportunities instead of the live ones. */
  closed: boolean;
}

interface JobFiltersProps {
  value: FilterState;
  onChange: (next: Partial<FilterState>) => void;
  onReset: () => void;
  total?: number;
}

export function JobFilters({ value, onChange, onReset, total }: JobFiltersProps) {
  const { data: categories } = useCategories();
  const { data: tags } = useTags();

  // The search box is local state, debounced into the parent. Driving it straight
  // from `value.q` would fire a request on every keystroke — a dozen queries to
  // type "software" — and on a slow connection the results would arrive out of
  // order, so the grid would flicker through stale matches.
  const [search, setSearch] = React.useState(value.q);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      if (search !== value.q) onChange({ q: search });
    }, 350);

    return () => clearTimeout(timer);
    // `value.q` is deliberately excluded: including it would re-arm the timer
    // when the parent echoes our own value back, and the debounce would never settle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // Keep in step when the parent resets or a URL is pasted in.
  React.useEffect(() => {
    setSearch(value.q);
  }, [value.q]);

  const activeCount =
    (value.category ? 1 : 0) +
    (value.mode ? 1 : 0) +
    (value.closingSoon ? 1 : 0) +
    value.tags.length;

  const toggleTag = (slug: string) => {
    onChange({
      tags: value.tags.includes(slug)
        ? value.tags.filter((t) => t !== slug)
        : [...value.tags, slug],
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by role, company, skill…"
            className="pl-9"
            aria-label="Search opportunities"
          />
        </div>

        <Select value={value.sort} onValueChange={(v) => onChange({ sort: v })}>
          <SelectTrigger className="w-full sm:w-48" aria-label="Sort by">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {JOB_SORT_OPTIONS.map((opt) => (
              <SelectItem key={opt} value={opt}>
                {JOB_SORT_LABELS[opt]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="relative shrink-0">
              <SlidersHorizontal className="h-4 w-4" />
              Filters
              {activeCount > 0 ? (
                <Badge variant="default" className="ml-1 h-5 min-w-5 justify-center px-1">
                  {activeCount}
                </Badge>
              ) : null}
            </Button>
          </PopoverTrigger>

          <PopoverContent align="end" className="w-80">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Filters</p>
                {activeCount > 0 ? (
                  <Button variant="ghost" size="sm" onClick={onReset} className="h-7 text-xs">
                    Clear all
                  </Button>
                ) : null}
              </div>

              <Separator />

              <div className="space-y-2">
                <Label>Category</Label>
                <Select
                  // Radix rejects "" as an item value, so "all" is the sentinel and
                  // is mapped back to an empty filter on the way out.
                  value={value.category || 'all'}
                  onValueChange={(v) => onChange({ category: v === 'all' ? '' : v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Any category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any category</SelectItem>
                    {categories?.map((cat) => (
                      <SelectItem key={cat.id} value={cat.slug}>
                        {cat.name} ({cat.jobCount ?? 0})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Work mode</Label>
                <Select
                  value={value.mode || 'all'}
                  onValueChange={(v) => onChange({ mode: v === 'all' ? '' : v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Any mode" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any mode</SelectItem>
                    {JOB_MODES.map((mode) => (
                      <SelectItem key={mode} value={mode}>
                        {JOB_MODE_LABELS[mode]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Deadline</Label>
                <Button
                  type="button"
                  variant={value.closingSoon ? 'default' : 'outline'}
                  size="sm"
                  className="w-full"
                  onClick={() => onChange({ closingSoon: !value.closingSoon })}
                  aria-pressed={value.closingSoon}
                >
                  Closing within a week
                </Button>
              </div>

              {tags && tags.length > 0 ? (
                <div className="space-y-2">
                  <Label>Skills</Label>
                  <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
                    {tags.map((tag) => {
                      const selected = value.tags.includes(tag.slug);
                      return (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={() => toggleTag(tag.slug)}
                          aria-pressed={selected}
                          className={cn(
                            'rounded-md border px-2 py-0.5 text-xs font-medium transition-colors',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            selected
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground',
                          )}
                        >
                          {tag.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Active filters, shown as removable chips. A filter you cannot see is a
          filter you will forget you applied, and then the empty results look
          like a bug. */}
      {activeCount > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {total !== undefined ? `${total} result${total === 1 ? '' : 's'}` : 'Filtered by'}
          </span>

          {value.category ? (
            <FilterChip
              label={categories?.find((c) => c.slug === value.category)?.name ?? value.category}
              onRemove={() => onChange({ category: '' })}
            />
          ) : null}

          {value.mode ? (
            <FilterChip
              label={JOB_MODE_LABELS[value.mode as keyof typeof JOB_MODE_LABELS]}
              onRemove={() => onChange({ mode: '' })}
            />
          ) : null}

          {value.closingSoon ? (
            <FilterChip label="Closing soon" onRemove={() => onChange({ closingSoon: false })} />
          ) : null}

          {value.tags.map((slug) => (
            <FilterChip
              key={slug}
              label={tags?.find((t) => t.slug === slug)?.name ?? slug}
              onRemove={() => toggleTag(slug)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-0.5 text-xs font-medium">
      {label}
      <button
        type="button"
        onClick={onRemove}
        className="rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Remove ${label} filter`}
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}
