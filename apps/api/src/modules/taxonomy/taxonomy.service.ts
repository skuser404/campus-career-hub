import type {
  CategoryInput,
  CompanyInput,
  TagInput,
  TaxonomyListQuery,
  UpdateCategoryInput,
  UpdateCompanyInput,
} from '@cch/shared';
import { and, asc, count, eq, ilike, sql, type SQL } from 'drizzle-orm';
import { db } from '../../db/client';
import { categories, companies, jobs, tags } from '../../db/schema';
import { notFound } from '../../lib/errors';
import { buildPaginationMeta, offset, slugify, uniqueSlug } from '../../lib/utils';

/**
 * Companies, categories and tags.
 *
 * Each list query reports a `jobCount`, computed with a correlated subquery
 * rather than a GROUP BY join. A join would drop any row with zero jobs, and a
 * brand-new company with no postings yet is exactly the row an admin most needs
 * to see.
 */

// ── Companies ────────────────────────────────────────────────────────────

const companyJobCount = sql<number>`(
  SELECT COUNT(*)::int FROM ${jobs}
  WHERE ${jobs.companyId} = ${companies.id} AND ${jobs.status} = 'published'
)`;

export async function listCompanies(query: TaxonomyListQuery) {
  const filters: SQL[] = [];
  if (query.q) filters.push(ilike(companies.name, `%${query.q}%`));
  const where = filters.length > 0 ? and(...filters) : undefined;

  const [countResult, rows] = await Promise.all([
    db.select({ value: count() }).from(companies).where(where),
    db
      .select({
        id: companies.id,
        name: companies.name,
        slug: companies.slug,
        logoUrl: companies.logoUrl,
        website: companies.website,
        description: companies.description,
        createdAt: companies.createdAt,
        jobCount: companyJobCount,
      })
      .from(companies)
      .where(where)
      .orderBy(asc(companies.name))
      .limit(query.limit)
      .offset(offset(query.page, query.limit)),
  ]);

  return {
    items: rows,
    pagination: buildPaginationMeta(query.page, query.limit, countResult[0]?.value ?? 0),
  };
}

export async function createCompany(input: CompanyInput) {
  const slug = await uniqueSlug(input.slug ?? input.name, async (s) => {
    const [hit] = await db
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.slug, s))
      .limit(1);
    return Boolean(hit);
  });

  const [row] = await db
    .insert(companies)
    .values({
      name: input.name,
      slug,
      logoUrl: input.logoUrl ?? null,
      website: input.website ?? null,
      description: input.description ?? null,
    })
    .returning();

  return row;
}

export async function updateCompany(id: string, input: UpdateCompanyInput) {
  const patch: Record<string, unknown> = { updatedAt: new Date() };

  if (input.name !== undefined) patch.name = input.name;
  if (input.logoUrl !== undefined) patch.logoUrl = input.logoUrl;
  if (input.website !== undefined) patch.website = input.website;
  if (input.description !== undefined) patch.description = input.description;
  if (input.slug !== undefined) patch.slug = slugify(input.slug);

  const [row] = await db.update(companies).set(patch).where(eq(companies.id, id)).returning();
  if (!row) throw notFound('Company');

  return row;
}

/**
 * The FK is ON DELETE RESTRICT, so Postgres refuses if opportunities remain and
 * `mapDatabaseError` turns that into a clear 409. We do not silently cascade —
 * deleting a company must never quietly delete students' application history.
 */
export async function deleteCompany(id: string) {
  const deleted = await db.delete(companies).where(eq(companies.id, id)).returning({ id: companies.id });
  if (deleted.length === 0) throw notFound('Company');
}

// ── Categories ───────────────────────────────────────────────────────────

const categoryJobCount = sql<number>`(
  SELECT COUNT(*)::int FROM ${jobs}
  WHERE ${jobs.categoryId} = ${categories.id} AND ${jobs.status} = 'published'
)`;

export async function listCategories() {
  return db
    .select({
      id: categories.id,
      name: categories.name,
      slug: categories.slug,
      description: categories.description,
      color: categories.color,
      icon: categories.icon,
      sortOrder: categories.sortOrder,
      jobCount: categoryJobCount,
    })
    .from(categories)
    .orderBy(asc(categories.sortOrder), asc(categories.name));
}

export async function createCategory(input: CategoryInput) {
  const slug = await uniqueSlug(input.slug ?? input.name, async (s) => {
    const [hit] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.slug, s))
      .limit(1);
    return Boolean(hit);
  });

  const [row] = await db
    .insert(categories)
    .values({
      name: input.name,
      slug,
      description: input.description ?? null,
      color: input.color ?? null,
      icon: input.icon ?? null,
      sortOrder: input.sortOrder,
    })
    .returning();

  return row;
}

export async function updateCategory(id: string, input: UpdateCategoryInput) {
  const patch: Record<string, unknown> = { updatedAt: new Date() };

  if (input.name !== undefined) patch.name = input.name;
  if (input.description !== undefined) patch.description = input.description;
  if (input.color !== undefined) patch.color = input.color;
  if (input.icon !== undefined) patch.icon = input.icon;
  if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder;
  if (input.slug !== undefined) patch.slug = slugify(input.slug);

  const [row] = await db.update(categories).set(patch).where(eq(categories.id, id)).returning();
  if (!row) throw notFound('Category');

  return row;
}

export async function deleteCategory(id: string) {
  const deleted = await db
    .delete(categories)
    .where(eq(categories.id, id))
    .returning({ id: categories.id });

  if (deleted.length === 0) throw notFound('Category');
}

// ── Tags ─────────────────────────────────────────────────────────────────

export async function listTags(query?: TaxonomyListQuery) {
  const filters: SQL[] = [];
  if (query?.q) filters.push(ilike(tags.name, `%${query.q}%`));

  return db
    .select({
      id: tags.id,
      name: tags.name,
      slug: tags.slug,
    })
    .from(tags)
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(asc(tags.name));
}

/**
 * Idempotent create.
 *
 * The job form lets an admin type a new tag inline. Two admins doing that at the
 * same moment would otherwise collide on the unique index, so an existing tag is
 * returned rather than treated as an error.
 */
export async function createTag(input: TagInput) {
  const slug = slugify(input.name);

  const [existing] = await db.select().from(tags).where(eq(tags.slug, slug)).limit(1);
  if (existing) return existing;

  const [row] = await db.insert(tags).values({ name: input.name, slug }).returning();
  return row;
}

export async function deleteTag(id: string) {
  // job_tags cascades, so the tag simply detaches from any job that used it.
  const deleted = await db.delete(tags).where(eq(tags.id, id)).returning({ id: tags.id });
  if (deleted.length === 0) throw notFound('Tag');
}
