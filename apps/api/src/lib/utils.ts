import type { PaginationMeta } from '@cch/shared';

/**
 * URL-safe slug. Strips diacritics, drops anything that is not a letter, digit
 * or space, and collapses runs of separators.
 */
export function slugify(input: string): string {
  return (
    input
      .normalize('NFKD')
      // Strip combining diacritical marks, so "Café" becomes "cafe" rather than
      // losing the letter entirely.
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .trim()
      // The underscore MUST survive this step. It is a word separator, and
      // dropping it here would turn "full_stack" into "fullstack" — the next
      // replace can only collapse separators it can still see.
      .replace(/[^a-z0-9\s_-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 200)
  );
}

/**
 * Build a slug that does not collide with one already taken.
 *
 * `exists` is injected rather than assumed, so this stays a pure function that
 * unit tests can drive without a database.
 */
export async function uniqueSlug(
  base: string,
  exists: (slug: string) => Promise<boolean>,
): Promise<string> {
  const root = slugify(base) || 'item';

  if (!(await exists(root))) return root;

  for (let i = 2; i < 100; i++) {
    const candidate = `${root}-${i}`;
    if (!(await exists(candidate))) return candidate;
  }

  // Pathological collision: fall back to a random suffix rather than looping forever.
  return `${root}-${Date.now().toString(36)}`;
}

export function buildPaginationMeta(page: number, limit: number, total: number): PaginationMeta {
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}

/** Wraps an async Express handler so a rejected promise reaches the error middleware. */
export const offset = (page: number, limit: number): number => (page - 1) * limit;

/** The client's real IP, honouring the proxy Render/Vercel put in front of us. */
export function clientIp(req: { ip?: string; headers: Record<string, unknown> }): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return (forwarded.split(',')[0] as string).trim();
  }
  return req.ip ?? 'unknown';
}
