import { describe, expect, it } from 'vitest';
import { hashRefreshToken, parseDuration } from '../lib/jwt';
import { hashPassword, verifyPassword } from '../lib/password';
import { buildPaginationMeta, slugify, uniqueSlug } from '../lib/utils';

/**
 * Unit tests — no database required.
 *
 * These cover the pure logic where a subtle bug is invisible in code review:
 * duration parsing, slug collision handling, pagination arithmetic, and the
 * password primitives.
 */

describe('parseDuration', () => {
  it('parses each unit', () => {
    expect(parseDuration('30s')).toBe(30_000);
    expect(parseDuration('15m')).toBe(900_000);
    expect(parseDuration('24h')).toBe(86_400_000);
    expect(parseDuration('7d')).toBe(604_800_000);
  });

  it('tolerates whitespace and case', () => {
    expect(parseDuration(' 15M ')).toBe(900_000);
  });

  it('throws on malformed input rather than silently returning NaN', () => {
    // A silent NaN here would produce a cookie with maxAge=NaN — a session
    // token that expires immediately, or never. Failing loudly is the point.
    expect(() => parseDuration('15')).toThrow();
    expect(() => parseDuration('abc')).toThrow();
    expect(() => parseDuration('15y')).toThrow();
    expect(() => parseDuration('')).toThrow();
  });
});

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Software Engineer')).toBe('software-engineer');
  });

  it('strips punctuation', () => {
    expect(slugify('SDE-1 @ Google (2026)!')).toBe('sde-1-google-2026');
  });

  it('collapses runs of separators', () => {
    expect(slugify('a   b___c')).toBe('a-b-c');
  });

  it('trims leading and trailing hyphens', () => {
    expect(slugify('  --hello--  ')).toBe('hello');
  });

  it('strips diacritics rather than dropping the letter', () => {
    expect(slugify('Café Zürich')).toBe('cafe-zurich');
  });

  it('returns empty for input with no slug-able characters', () => {
    expect(slugify('!!!')).toBe('');
  });
});

describe('uniqueSlug', () => {
  it('returns the base slug when it is free', async () => {
    const result = await uniqueSlug('Software Engineer', async () => false);
    expect(result).toBe('software-engineer');
  });

  it('appends a counter on collision', async () => {
    const taken = new Set(['sde', 'sde-2', 'sde-3']);
    const result = await uniqueSlug('SDE', async (s) => taken.has(s));
    expect(result).toBe('sde-4');
  });

  it('falls back to "item" when the input slugifies to nothing', async () => {
    const result = await uniqueSlug('!!!', async () => false);
    expect(result).toBe('item');
  });
});

describe('buildPaginationMeta', () => {
  it('computes page counts and flags', () => {
    const meta = buildPaginationMeta(2, 10, 35);
    expect(meta).toEqual({
      page: 2,
      limit: 10,
      total: 35,
      totalPages: 4,
      hasNext: true,
      hasPrev: true,
    });
  });

  it('handles an empty result set without dividing by zero', () => {
    const meta = buildPaginationMeta(1, 10, 0);
    expect(meta.totalPages).toBe(0);
    expect(meta.hasNext).toBe(false);
    expect(meta.hasPrev).toBe(false);
  });

  it('marks the last page as having no next', () => {
    const meta = buildPaginationMeta(4, 10, 35);
    expect(meta.hasNext).toBe(false);
    expect(meta.hasPrev).toBe(true);
  });

  it('handles an exact multiple', () => {
    const meta = buildPaginationMeta(3, 10, 30);
    expect(meta.totalPages).toBe(3);
    expect(meta.hasNext).toBe(false);
  });
});

describe('password hashing', () => {
  it('verifies a correct password', async () => {
    const hash = await hashPassword('Str0ngPass');
    expect(await verifyPassword('Str0ngPass', hash)).toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await hashPassword('Str0ngPass');
    expect(await verifyPassword('WrongPass1', hash)).toBe(false);
  });

  it('salts — the same password hashes differently every time', async () => {
    // If these were equal, identical passwords would be identifiable from a
    // database dump, and one cracked hash would unlock every account using it.
    const a = await hashPassword('Str0ngPass');
    const b = await hashPassword('Str0ngPass');
    expect(a).not.toBe(b);
  });

  it('never stores the plaintext in the hash', async () => {
    const hash = await hashPassword('Str0ngPass');
    expect(hash).not.toContain('Str0ngPass');
  });
});

describe('hashRefreshToken', () => {
  it('is deterministic, so a lookup by hash finds the row', () => {
    expect(hashRefreshToken('abc')).toBe(hashRefreshToken('abc'));
  });

  it('differs for different tokens', () => {
    expect(hashRefreshToken('abc')).not.toBe(hashRefreshToken('abd'));
  });

  it('does not contain the raw token', () => {
    expect(hashRefreshToken('secret-token')).not.toContain('secret-token');
  });
});
