import {
  CLOSING_SOON_DAYS,
  type AdminJobQuery,
  type Job,
  type JobInput,
  type JobQuery,
  type UpdateJobInput,
} from '@cch/shared';
import { and, asc, count, desc, eq, gte, inArray, lte, or, sql, type SQL } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  applications,
  categories,
  companies,
  departments,
  jobDepartments,
  jobTags,
  jobViews,
  jobYears,
  jobs,
  savedJobs,
  tags,
} from '../../db/schema';
import { notFound } from '../../lib/errors';
import { buildPaginationMeta, offset, uniqueSlug } from '../../lib/utils';

/**
 * Who is asking. Not optional metadata — it is the input to an authorisation
 * decision, so it is threaded explicitly through every read in this file rather
 * than pulled from some ambient context where it could be forgotten.
 */
export interface Viewer {
  userId: string;
  role: 'student' | 'admin';
  departmentId: string | null;
  year: number | null;
}

/**
 * The full-text expression. Must match the GIN index in schema.ts EXACTLY — if
 * the two drift, Postgres silently stops using the index and the query degrades
 * to a sequential scan without any visible error.
 */
const searchVector = sql`to_tsvector('english',
  coalesce(${jobs.role}, '') || ' ' ||
  coalesce(${jobs.description}, '') || ' ' ||
  coalesce(${jobs.eligibility}, '') || ' ' ||
  coalesce(${jobs.location}, ''))`;

/**
 * ═══════════════════════════════════════════════════════════════════════
 * THE ELIGIBILITY PREDICATE — the single most important function here.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * A student may see an opportunity when BOTH hold:
 *
 *   • it targets no department, OR it targets theirs
 *   • it targets no year,       OR it targets theirs
 *
 * "Targets no department" means zero rows in `job_departments`, and that is
 * why it reads as `NOT EXISTS (...) OR EXISTS (... AND dept = mine)` rather
 * than a join. A join would drop every unrestricted opportunity — the common
 * case — and a university-wide posting would become invisible to everyone.
 *
 * This runs in SQL, inside the WHERE clause, on EVERY read path: the list, the
 * search, the detail page, the saved list, the dashboard rails. It is not a UI
 * filter and it is not applied after the fact. An ISE student asking for a
 * CSE-only opportunity by its exact slug matches zero rows and receives a 404 —
 * not a 403, because confirming the thing exists would itself leak that it does.
 */
function eligibilityFilter(viewer: Viewer | null): SQL | undefined {
  // An admin sees everything. That is the entire point of being an admin.
  if (viewer?.role === 'admin') return undefined;

  // Anonymous, or a student with no department on file (a bad import row):
  // they may see only the opportunities that are open to absolutely everyone.
  // Failing CLOSED is the only defensible default — the alternative would show
  // every restricted posting to the one user we know least about.
  const deptId = viewer?.departmentId ?? null;
  const year = viewer?.year ?? null;

  const departmentOk = deptId
    ? sql`(
        NOT EXISTS (SELECT 1 FROM ${jobDepartments} WHERE ${jobDepartments.jobId} = ${jobs.id})
        OR EXISTS (
          SELECT 1 FROM ${jobDepartments}
          WHERE ${jobDepartments.jobId} = ${jobs.id}
            AND ${jobDepartments.departmentId} = ${deptId}
        )
      )`
    : sql`NOT EXISTS (SELECT 1 FROM ${jobDepartments} WHERE ${jobDepartments.jobId} = ${jobs.id})`;

  const yearOk = year
    ? sql`(
        NOT EXISTS (SELECT 1 FROM ${jobYears} WHERE ${jobYears.jobId} = ${jobs.id})
        OR EXISTS (
          SELECT 1 FROM ${jobYears}
          WHERE ${jobYears.jobId} = ${jobs.id}
            AND ${jobYears.year} = ${year}
        )
      )`
    : sql`NOT EXISTS (SELECT 1 FROM ${jobYears} WHERE ${jobYears.jobId} = ${jobs.id})`;

  return and(departmentOk, yearOk);
}

/** Columns every job query selects. Declared once so list and detail cannot diverge. */
const jobColumns = {
  id: jobs.id,
  slug: jobs.slug,
  role: jobs.role,
  description: jobs.description,
  eligibility: jobs.eligibility,
  salaryMin: jobs.salaryMin,
  salaryMax: jobs.salaryMax,
  salaryCurrency: jobs.salaryCurrency,
  salaryText: jobs.salaryText,
  location: jobs.location,
  mode: jobs.mode,
  deadline: jobs.deadline,
  applicationLink: jobs.applicationLink,
  imageUrl: jobs.imageUrl,
  status: jobs.status,
  isFeatured: jobs.isFeatured,
  viewsCount: jobs.viewsCount,
  createdAt: jobs.createdAt,
  updatedAt: jobs.updatedAt,
  companyId: companies.id,
  companyName: companies.name,
  companySlug: companies.slug,
  companyLogoUrl: companies.logoUrl,
  companyWebsite: companies.website,
  categoryId: categories.id,
  categoryName: categories.name,
  categorySlug: categories.slug,
  categoryColor: categories.color,
  categoryIcon: categories.icon,
};

/**
 * A column's `data` type alone is not enough — it reports `string` for a nullable
 * text column. The `notNull` flag must be consulted too, or every nullable field
 * silently types as non-null and the compiler stops protecting us from the exact
 * null it exists to catch.
 */
type ColumnData<C> = C extends { _: { data: infer D; notNull: infer N } }
  ? N extends true
    ? D
    : D | null
  : never;

type JobRowJoined = { [K in keyof typeof jobColumns]: ColumnData<(typeof jobColumns)[K]> };

function shapeJob(row: JobRowJoined): Omit<Job, 'tags' | 'departments' | 'years'> {
  return {
    id: row.id,
    slug: row.slug,
    role: row.role,
    description: row.description,
    eligibility: row.eligibility,
    salaryMin: row.salaryMin,
    salaryMax: row.salaryMax,
    salaryCurrency: row.salaryCurrency,
    salaryText: row.salaryText,
    location: row.location,
    mode: row.mode,
    deadline: row.deadline,
    applicationLink: row.applicationLink,
    imageUrl: row.imageUrl,
    status: row.status,
    isFeatured: row.isFeatured,
    viewsCount: row.viewsCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    company: {
      id: row.companyId,
      name: row.companyName,
      slug: row.companySlug,
      logoUrl: row.companyLogoUrl,
      website: row.companyWebsite,
    },
    category: {
      id: row.categoryId,
      name: row.categoryName,
      slug: row.categorySlug,
      color: row.categoryColor,
      icon: row.categoryIcon,
    },
  };
}

/**
 * Attach tags, departments, years and (for a signed-in student) saved/applied
 * flags.
 *
 * Five small indexed queries against a bounded set of ids, rather than one query
 * per job. Joining any of these into the main query would multiply rows by their
 * cardinality and corrupt LIMIT/OFFSET — a job with five tags would eat five
 * slots of a twelve-item page.
 */
async function hydrate(rows: JobRowJoined[], viewer: Viewer | null): Promise<Job[]> {
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);

  const [tagRows, deptRows, yearRows] = await Promise.all([
    db
      .select({ jobId: jobTags.jobId, id: tags.id, name: tags.name, slug: tags.slug })
      .from(jobTags)
      .innerJoin(tags, eq(jobTags.tagId, tags.id))
      .where(inArray(jobTags.jobId, ids)),

    db
      .select({
        jobId: jobDepartments.jobId,
        id: departments.id,
        code: departments.code,
        name: departments.name,
      })
      .from(jobDepartments)
      .innerJoin(departments, eq(jobDepartments.departmentId, departments.id))
      .where(inArray(jobDepartments.jobId, ids)),

    db
      .select({ jobId: jobYears.jobId, year: jobYears.year })
      .from(jobYears)
      .where(inArray(jobYears.jobId, ids)),
  ]);

  const tagsByJob = new Map<string, Array<{ id: string; name: string; slug: string }>>();
  for (const t of tagRows) {
    const list = tagsByJob.get(t.jobId) ?? [];
    list.push({ id: t.id, name: t.name, slug: t.slug });
    tagsByJob.set(t.jobId, list);
  }

  const deptsByJob = new Map<string, Array<{ id: string; code: string; name: string }>>();
  for (const d of deptRows) {
    const list = deptsByJob.get(d.jobId) ?? [];
    list.push({ id: d.id, code: d.code, name: d.name });
    deptsByJob.set(d.jobId, list);
  }

  const yearsByJob = new Map<string, number[]>();
  for (const y of yearRows) {
    const list = yearsByJob.get(y.jobId) ?? [];
    list.push(y.year);
    yearsByJob.set(y.jobId, list);
  }

  let savedSet = new Set<string>();
  let appliedSet = new Set<string>();

  if (viewer) {
    const [savedRows, appliedRows] = await Promise.all([
      db
        .select({ jobId: savedJobs.jobId })
        .from(savedJobs)
        .where(and(eq(savedJobs.userId, viewer.userId), inArray(savedJobs.jobId, ids))),
      db
        .select({ jobId: applications.jobId })
        .from(applications)
        .where(and(eq(applications.userId, viewer.userId), inArray(applications.jobId, ids))),
    ]);

    savedSet = new Set(savedRows.map((r) => r.jobId));
    appliedSet = new Set(appliedRows.map((r) => r.jobId));
  }

  return rows.map((row) => ({
    ...shapeJob(row),
    tags: tagsByJob.get(row.id) ?? [],
    departments: deptsByJob.get(row.id) ?? [],
    years: (yearsByJob.get(row.id) ?? []).sort((a, b) => a - b),
    ...(viewer
      ? { isSaved: savedSet.has(row.id), isApplied: appliedSet.has(row.id) }
      : {}),
  }));
}

/**
 * Build the WHERE clause.
 *
 * Two boundaries are applied here and cannot be opted out of by a caller:
 *
 *   1. STATUS — a non-admin only ever sees `published`. There is no `status`
 *      field on `JobQuery` at all, so a student cannot even ask for drafts.
 *   2. ELIGIBILITY — the department/year predicate above.
 */
function buildFilters(query: JobQuery | AdminJobQuery, viewer: Viewer | null): SQL[] {
  const isAdmin = viewer?.role === 'admin';
  const filters: SQL[] = [];

  if (isAdmin) {
    const adminQuery = query as AdminJobQuery;
    if (adminQuery.status) filters.push(eq(jobs.status, adminQuery.status));
    if (adminQuery.departmentId) {
      filters.push(
        sql`EXISTS (
          SELECT 1 FROM ${jobDepartments}
          WHERE ${jobDepartments.jobId} = ${jobs.id}
            AND ${jobDepartments.departmentId} = ${adminQuery.departmentId}
        )`,
      );
    }
  } else {
    filters.push(eq(jobs.status, 'published'));
  }

  const eligibility = eligibilityFilter(viewer);
  if (eligibility) filters.push(eligibility);

  if (query.q) {
    filters.push(sql`${searchVector} @@ plainto_tsquery('english', ${query.q})`);
  }

  if (query.category) filters.push(eq(categories.slug, query.category));
  if (query.company) filters.push(eq(companies.slug, query.company));
  if (query.mode) filters.push(eq(jobs.mode, query.mode));
  if (query.featured) filters.push(eq(jobs.isFeatured, true));

  if (query.salaryMin !== undefined) {
    // A posting with no stated maximum still qualifies — excluding it would hide
    // "as per company norms" listings from anyone who sets a salary floor.
    filters.push(
      or(gte(jobs.salaryMax, query.salaryMin), gte(jobs.salaryMin, query.salaryMin)) as SQL,
    );
  }

  if (query.deadlineAfter) filters.push(gte(jobs.deadline, query.deadlineAfter));
  if (query.deadlineBefore) filters.push(lte(jobs.deadline, query.deadlineBefore));

  if (query.closingSoon) {
    const horizon = new Date(Date.now() + CLOSING_SOON_DAYS * 86_400_000);
    filters.push(gte(jobs.deadline, new Date()));
    filters.push(lte(jobs.deadline, horizon));
  }

  if (query.tags && query.tags.length > 0) {
    // EXISTS rather than a join: a join would duplicate a job row once per
    // matching tag and break the page count.
    filters.push(
      sql`EXISTS (
        SELECT 1 FROM ${jobTags}
        INNER JOIN ${tags} ON ${tags.id} = ${jobTags.tagId}
        WHERE ${jobTags.jobId} = ${jobs.id}
          AND ${tags.slug} IN ${query.tags}
      )`,
    );
  }

  return filters;
}

function buildOrderBy(sort: JobQuery['sort']): SQL[] {
  // Featured first on every sort — that is what "featured" means. It is a
  // tiebreak on the primary sort, not a replacement for it.
  const featured = desc(jobs.isFeatured);

  switch (sort) {
    case 'deadline':
      // NULLS LAST: an opportunity with no deadline is not "closing soonest".
      return [featured, sql`${jobs.deadline} ASC NULLS LAST`, desc(jobs.createdAt)];
    case 'salary':
      return [featured, sql`${jobs.salaryMax} DESC NULLS LAST`, desc(jobs.createdAt)];
    case 'popular':
      return [featured, desc(jobs.viewsCount), desc(jobs.createdAt)];
    case 'newest':
    default:
      return [featured, desc(jobs.createdAt)];
  }
}

export async function list(query: JobQuery | AdminJobQuery, viewer: Viewer | null) {
  const filters = buildFilters(query, viewer);
  const where = filters.length > 0 ? and(...filters) : undefined;

  const [countResult, rows] = await Promise.all([
    db
      .select({ value: count() })
      .from(jobs)
      .innerJoin(companies, eq(jobs.companyId, companies.id))
      .innerJoin(categories, eq(jobs.categoryId, categories.id))
      .where(where),

    db
      .select(jobColumns)
      .from(jobs)
      .innerJoin(companies, eq(jobs.companyId, companies.id))
      .innerJoin(categories, eq(jobs.categoryId, categories.id))
      .where(where)
      .orderBy(...buildOrderBy(query.sort))
      .limit(query.limit)
      .offset(offset(query.page, query.limit)),
  ]);

  return {
    items: await hydrate(rows, viewer),
    pagination: buildPaginationMeta(query.page, query.limit, countResult[0]?.value ?? 0),
  };
}

/**
 * Fetch by slug.
 *
 * The eligibility filter is applied HERE too, not only on the list. This is the
 * route a student takes when a classmate pastes them a link — exactly the case a
 * UI-only filter would fail to catch.
 */
export async function getBySlug(slug: string, viewer: Viewer | null): Promise<Job> {
  const filters: SQL[] = [eq(jobs.slug, slug)];

  if (viewer?.role !== 'admin') {
    filters.push(eq(jobs.status, 'published'));
    const eligibility = eligibilityFilter(viewer);
    if (eligibility) filters.push(eligibility);
  }

  const [row] = await db
    .select(jobColumns)
    .from(jobs)
    .innerJoin(companies, eq(jobs.companyId, companies.id))
    .innerJoin(categories, eq(jobs.categoryId, categories.id))
    .where(and(...filters))
    .limit(1);

  // 404, not 403. A 403 would confirm the opportunity exists, which tells an
  // ineligible student exactly what they are missing and which department to
  // claim they belong to.
  if (!row) throw notFound('Opportunity');

  const [hydrated] = await hydrate([row], viewer);
  return hydrated as Job;
}

export async function getById(id: string, viewer: Viewer | null): Promise<Job> {
  const filters: SQL[] = [eq(jobs.id, id)];

  if (viewer?.role !== 'admin') {
    filters.push(eq(jobs.status, 'published'));
    const eligibility = eligibilityFilter(viewer);
    if (eligibility) filters.push(eligibility);
  }

  const [row] = await db
    .select(jobColumns)
    .from(jobs)
    .innerJoin(companies, eq(jobs.companyId, companies.id))
    .innerJoin(categories, eq(jobs.categoryId, categories.id))
    .where(and(...filters))
    .limit(1);

  if (!row) throw notFound('Opportunity');

  const [hydrated] = await hydrate([row], viewer);
  return hydrated as Job;
}

/**
 * Fetch many jobs by id in ONE query, in the order the ids were given.
 *
 * Eligibility still applies. A student who saved an opportunity and then had
 * their department corrected must stop seeing it — so this cannot be a trusted
 * "they already had access" shortcut.
 */
export async function getByIds(ids: string[], viewer: Viewer | null): Promise<Job[]> {
  if (ids.length === 0) return [];

  const filters: SQL[] = [inArray(jobs.id, ids)];

  if (viewer?.role !== 'admin') {
    const eligibility = eligibilityFilter(viewer);
    if (eligibility) filters.push(eligibility);
  }

  const rows = await db
    .select(jobColumns)
    .from(jobs)
    .innerJoin(companies, eq(jobs.companyId, companies.id))
    .innerJoin(categories, eq(jobs.categoryId, categories.id))
    .where(and(...filters));

  const hydrated = await hydrate(rows, viewer);
  const byId = new Map(hydrated.map((j) => [j.id, j]));

  // `WHERE id IN (...)` gives no ordering guarantee, so the caller's order is
  // reimposed. Without this a page of saved jobs would reshuffle on every refresh.
  return ids.map((id) => byId.get(id)).filter((j): j is Job => j !== undefined);
}

export async function recordView(jobId: string, userId?: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.insert(jobViews).values({ jobId, userId: userId ?? null });
    await tx
      .update(jobs)
      .set({ viewsCount: sql`${jobs.viewsCount} + 1` })
      .where(eq(jobs.id, jobId));
  });
}

const slugExists = async (slug: string): Promise<boolean> => {
  const [hit] = await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.slug, slug)).limit(1);
  return Boolean(hit);
};

/** Replace a job's eligibility and tag sets. Used by both create and update. */
async function writeRelations(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  jobId: string,
  input: { departmentIds?: string[]; years?: number[]; tagIds?: string[] },
  replace: boolean,
) {
  if (input.departmentIds !== undefined) {
    if (replace) await tx.delete(jobDepartments).where(eq(jobDepartments.jobId, jobId));
    if (input.departmentIds.length > 0) {
      await tx
        .insert(jobDepartments)
        .values(input.departmentIds.map((departmentId) => ({ jobId, departmentId })));
    }
  }

  if (input.years !== undefined) {
    if (replace) await tx.delete(jobYears).where(eq(jobYears.jobId, jobId));
    if (input.years.length > 0) {
      await tx.insert(jobYears).values(input.years.map((year) => ({ jobId, year })));
    }
  }

  if (input.tagIds !== undefined) {
    if (replace) await tx.delete(jobTags).where(eq(jobTags.jobId, jobId));
    if (input.tagIds.length > 0) {
      await tx.insert(jobTags).values(input.tagIds.map((tagId) => ({ jobId, tagId })));
    }
  }
}

export async function create(input: JobInput, postedBy: string): Promise<Job> {
  const [company] = await db
    .select({ name: companies.name })
    .from(companies)
    .where(eq(companies.id, input.companyId))
    .limit(1);

  if (!company) throw notFound('Company');

  const slug = await uniqueSlug(`${input.role} at ${company.name}`, slugExists);

  const jobId = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(jobs)
      .values({
        slug,
        companyId: input.companyId,
        categoryId: input.categoryId,
        role: input.role,
        description: input.description,
        eligibility: input.eligibility ?? null,
        salaryMin: input.salaryMin ?? null,
        salaryMax: input.salaryMax ?? null,
        salaryCurrency: input.salaryCurrency,
        salaryText: input.salaryText ?? null,
        location: input.location ?? null,
        mode: input.mode,
        deadline: input.deadline ?? null,
        applicationLink: input.applicationLink,
        imageUrl: input.imageUrl ?? null,
        status: input.status,
        isFeatured: input.isFeatured,
        postedBy,
      })
      .returning({ id: jobs.id });

    if (!row) throw new Error('Insert returned no row');

    await writeRelations(tx, row.id, input, false);
    return row.id;
  });

  // Read back as an admin — a freshly created draft must be returned to the
  // admin who made it even though no student could see it.
  return getById(jobId, { userId: postedBy, role: 'admin', departmentId: null, year: null });
}

export async function update(id: string, input: UpdateJobInput, actorId: string): Promise<Job> {
  const [existing] = await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.id, id)).limit(1);
  if (!existing) throw notFound('Opportunity');

  await db.transaction(async (tx) => {
    const patch: Record<string, unknown> = { updatedAt: new Date() };

    // Only copy keys the caller actually sent. Spreading `input` wholesale would
    // write `undefined` over columns the caller never mentioned.
    const assignable = [
      'companyId', 'categoryId', 'role', 'description', 'eligibility',
      'salaryMin', 'salaryMax', 'salaryCurrency', 'salaryText',
      'location', 'mode', 'deadline', 'applicationLink', 'imageUrl',
      'status', 'isFeatured',
    ] as const;

    for (const key of assignable) {
      if (input[key] !== undefined) patch[key] = input[key];
    }

    await tx.update(jobs).set(patch).where(eq(jobs.id, id));

    // A present key means "this is now the set" — replace it wholesale. An absent
    // key means "do not touch it". That distinction is why an admin editing only
    // the salary does not accidentally wipe the department restrictions.
    await writeRelations(tx, id, input, true);
  });

  return getById(id, { userId: actorId, role: 'admin', departmentId: null, year: null });
}

export async function remove(id: string): Promise<void> {
  const deleted = await db.delete(jobs).where(eq(jobs.id, id)).returning({ id: jobs.id });
  if (deleted.length === 0) throw notFound('Opportunity');
}

export async function bulkAction(
  ids: string[],
  action: 'publish' | 'close' | 'archive' | 'feature' | 'unfeature' | 'delete',
): Promise<number> {
  if (action === 'delete') {
    const deleted = await db.delete(jobs).where(inArray(jobs.id, ids)).returning({ id: jobs.id });
    return deleted.length;
  }

  const patch: Record<string, unknown> = { updatedAt: new Date() };

  if (action === 'feature') patch.isFeatured = true;
  else if (action === 'unfeature') patch.isFeatured = false;
  else patch.status = ({ publish: 'published', close: 'closed', archive: 'archived' } as const)[action];

  const updated = await db
    .update(jobs)
    .set(patch)
    .where(inArray(jobs.id, ids))
    .returning({ id: jobs.id });

  return updated.length;
}

/**
 * Dashboard rails.
 *
 * Every one of these runs through the same eligibility filter as the search —
 * a "featured" opportunity a student is not eligible for is not featured FOR
 * THEM, and would otherwise be the easiest way to leak a restricted posting.
 */
export async function getFeatured(viewer: Viewer | null) {
  const now = new Date();
  const horizon = new Date(Date.now() + CLOSING_SOON_DAYS * 86_400_000);

  const visible = [eq(jobs.status, 'published')];
  const eligibility = eligibilityFilter(viewer);
  if (eligibility) visible.push(eligibility);

  const base = () =>
    db
      .select(jobColumns)
      .from(jobs)
      .innerJoin(companies, eq(jobs.companyId, companies.id))
      .innerJoin(categories, eq(jobs.categoryId, categories.id));

  const [latest, closingSoon, featured] = await Promise.all([
    base().where(and(...visible)).orderBy(desc(jobs.createdAt)).limit(6),

    base()
      .where(and(...visible, gte(jobs.deadline, now), lte(jobs.deadline, horizon)))
      .orderBy(asc(jobs.deadline))
      .limit(6),

    base()
      .where(and(...visible, eq(jobs.isFeatured, true)))
      .orderBy(desc(jobs.createdAt))
      .limit(6),
  ]);

  return {
    latest: await hydrate(latest, viewer),
    closingSoon: await hydrate(closingSoon, viewer),
    featured: await hydrate(featured, viewer),
  };
}

/**
 * Which students should be notified about a newly published opportunity.
 *
 * The mirror image of `eligibilityFilter`, evaluated from the job's side. It is
 * derived from the same two tables, so a student is notified about exactly the
 * set of opportunities they can actually open — never one they would then be
 * 404'd on, which would be a maddening experience and an information leak.
 */
export async function findEligibleStudentIds(jobId: string): Promise<string[]> {
  const rows = await db.execute<{ id: string }>(sql`
    SELECT u.id
    FROM users u
    WHERE u.role = 'student'
      AND u.is_active = true
      AND (
        NOT EXISTS (SELECT 1 FROM job_departments jd WHERE jd.job_id = ${jobId})
        OR EXISTS (
          SELECT 1 FROM job_departments jd
          WHERE jd.job_id = ${jobId} AND jd.department_id = u.department_id
        )
      )
      AND (
        NOT EXISTS (SELECT 1 FROM job_years jy WHERE jy.job_id = ${jobId})
        OR EXISTS (
          SELECT 1 FROM job_years jy
          WHERE jy.job_id = ${jobId} AND jy.year = u.year
        )
      )
  `);

  return rows.rows.map((r) => r.id);
}
