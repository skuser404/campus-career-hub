import { CLOSING_SOON_DAYS } from '@cch/shared';
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind classes with conflict resolution.
 *
 * Plain `clsx` would leave `px-2 px-4` both present and let source order decide.
 * `twMerge` understands that they conflict and keeps the last, so a caller can
 * always override a component's default padding by passing their own.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** ₹1,20,000 — Indian digit grouping, which is what these students expect to read. */
export function formatSalary(
  min: number | null,
  max: number | null,
  currency = 'INR',
  text?: string | null,
): string {
  if (text && min === null && max === null) return text;
  if (min === null && max === null) return 'Not disclosed';

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
      notation: n >= 100_000 ? 'compact' : 'standard',
    }).format(n);

  const range =
    min !== null && max !== null
      ? min === max
        ? fmt(min)
        : `${fmt(min)} – ${fmt(max)}`
      : fmt((min ?? max) as number);

  return text ? `${range} ${text}` : range;
}

/**
 * How a deadline should be described and how alarmed the UI should look about it.
 *
 * Returned as data rather than JSX so the same logic drives a badge, a card
 * border and a dashboard counter without any of them re-deriving it — and so it
 * can be unit-tested without rendering anything.
 */
export type DeadlineUrgency = 'expired' | 'today' | 'urgent' | 'soon' | 'normal' | 'none';

export interface DeadlineInfo {
  urgency: DeadlineUrgency;
  label: string;
  daysLeft: number | null;
}

export function getDeadlineInfo(deadline: Date | string | null): DeadlineInfo {
  if (!deadline) return { urgency: 'none', label: 'No deadline', daysLeft: null };

  const date = typeof deadline === 'string' ? new Date(deadline) : deadline;
  const ms = date.getTime() - Date.now();
  const days = Math.ceil(ms / 86_400_000);

  if (ms < 0) return { urgency: 'expired', label: 'Closed', daysLeft: days };
  if (days <= 0) return { urgency: 'today', label: 'Closes today', daysLeft: 0 };
  if (days === 1) return { urgency: 'urgent', label: 'Closes tomorrow', daysLeft: 1 };
  if (days <= 3) return { urgency: 'urgent', label: `${days} days left`, daysLeft: days };
  if (days <= CLOSING_SOON_DAYS) return { urgency: 'soon', label: `${days} days left`, daysLeft: days };

  return { urgency: 'normal', label: formatDate(date), daysLeft: days };
}

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  }).format(d);
}

export function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
}

/** "3 days ago". Falls back to an absolute date past a month, where "5 weeks ago" stops being useful. */
export function formatRelative(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 2_592_000) return `${Math.floor(seconds / 86_400)}d ago`;

  return formatDate(d);
}

/** Initials for an avatar fallback. */
export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

/** Convert an object into a query string, dropping empty values so the URL stays clean. */
export function toSearchParams(obj: Record<string, unknown>): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null || value === '' || value === false) continue;

    if (Array.isArray(value)) {
      for (const v of value) params.append(key, String(v));
    } else {
      params.set(key, String(value));
    }
  }

  return params.toString();
}
