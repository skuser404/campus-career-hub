import {
  normalizeUsn,
  type Department,
  type DepartmentInput,
  type PublicUser,
  type ResetPasswordResult,
  type StudentInput,
  type StudentListQuery,
  type UpdateDepartmentInput,
  type UpdateStudentInput,
  type UserRole,
} from '@cch/shared';
import { and, asc, count, desc, eq, ilike, ne, or, sql, type SQL } from 'drizzle-orm';
import { db } from '../../db/client';
import { applications, departments, jobs, refreshTokens, savedJobs, users } from '../../db/schema';
import { conflict, notFound } from '../../lib/errors';
import { hashPassword } from '../../lib/password';
import { buildPaginationMeta, offset, slugify, uniqueSlug } from '../../lib/utils';
import { findById, toPublicUser } from '../auth/auth.service';

// ─────────────────────────────────────────────────────────────────────────
// Departments
// ─────────────────────────────────────────────────────────────────────────

export async function listDepartments(): Promise<Department[]> {
  const rows = await db
    .select({
      id: departments.id,
      code: departments.code,
      name: departments.name,
      slug: departments.slug,
      sortOrder: departments.sortOrder,
      // Correlated subqueries rather than GROUP BY joins: a join would drop a
      // brand-new department with no students yet, which is exactly the row an
      // admin most needs to see right after creating it.
      studentCount: sql<number>`(
        SELECT COUNT(*)::int FROM ${users}
        WHERE ${users.departmentId} = ${departments.id} AND ${users.role} = 'student'
      )`,
      jobCount: sql<number>`(
        SELECT COUNT(*)::int FROM job_departments jd
        INNER JOIN ${jobs} ON ${jobs.id} = jd.job_id
        WHERE jd.department_id = ${departments.id} AND ${jobs.status} = 'published'
      )`,
    })
    .from(departments)
    .orderBy(asc(departments.sortOrder), asc(departments.code));

  return rows;
}

export async function createDepartment(input: DepartmentInput) {
  const slug = await uniqueSlug(input.slug ?? input.code, async (s) => {
    const [hit] = await db
      .select({ id: departments.id })
      .from(departments)
      .where(eq(departments.slug, s))
      .limit(1);
    return Boolean(hit);
  });

  const [row] = await db
    .insert(departments)
    .values({
      code: input.code.toUpperCase(),
      name: input.name,
      slug,
      sortOrder: input.sortOrder,
    })
    .returning();

  return row;
}

export async function updateDepartment(id: string, input: UpdateDepartmentInput) {
  const patch: Record<string, unknown> = { updatedAt: new Date() };

  if (input.code !== undefined) patch.code = input.code.toUpperCase();
  if (input.name !== undefined) patch.name = input.name;
  if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder;
  if (input.slug !== undefined) patch.slug = slugify(input.slug);

  const [row] = await db.update(departments).set(patch).where(eq(departments.id, id)).returning();
  if (!row) throw notFound('Department');

  return row;
}

/**
 * Delete a department.
 *
 * Refused while students still belong to it. The FK is ON DELETE SET NULL, so
 * Postgres would happily orphan them — and an orphaned student has no department,
 * which means the eligibility filter shows them only university-wide postings.
 * They would silently lose access to their own branch's opportunities and nobody
 * would notice until a placement was missed. So we refuse, loudly.
 */
export async function deleteDepartment(id: string): Promise<void> {
  const [{ value: students } = { value: 0 }] = await db
    .select({ value: count() })
    .from(users)
    .where(eq(users.departmentId, id));

  if (students > 0) {
    throw conflict(
      `${students} student${students === 1 ? '' : 's'} still belong to this department. Reassign them first.`,
    );
  }

  const deleted = await db
    .delete(departments)
    .where(eq(departments.id, id))
    .returning({ id: departments.id });

  if (deleted.length === 0) throw notFound('Department');
}

// ─────────────────────────────────────────────────────────────────────────
// Students
// ─────────────────────────────────────────────────────────────────────────

export interface AdminStudentRow extends PublicUser {
  applicationCount: number;
  savedCount: number;
}

export async function listStudents(query: StudentListQuery) {
  const filters: SQL[] = [];

  if (query.q) {
    const term = `%${query.q}%`;
    filters.push(
      or(
        ilike(users.fullName, term),
        ilike(users.email, term),
        ilike(users.usn, term),
      ) as SQL,
    );
  }

  if (query.departmentId) filters.push(eq(users.departmentId, query.departmentId));
  if (query.year !== undefined) filters.push(eq(users.year, query.year));
  if (query.section) filters.push(eq(users.section, query.section));
  if (query.batch) filters.push(eq(users.batch, query.batch));
  if (query.role) filters.push(eq(users.role, query.role));
  if (query.isActive !== undefined) filters.push(eq(users.isActive, query.isActive));

  // The security-risk list: students who have never replaced their USN default.
  if (query.pendingPasswordChange !== undefined) {
    filters.push(eq(users.mustChangePassword, query.pendingPasswordChange));
  }

  const where = filters.length > 0 ? and(...filters) : undefined;

  const orderBy =
    query.sort === 'oldest'
      ? asc(users.createdAt)
      : query.sort === 'name'
        ? asc(users.fullName)
        : query.sort === 'usn'
          ? asc(users.usn)
          : desc(users.createdAt);

  const [countResult, rows] = await Promise.all([
    db.select({ value: count() }).from(users).where(where),

    db
      .select({
        id: users.id,
        email: users.email,
        fullName: users.fullName,
        usn: users.usn,
        role: users.role,
        year: users.year,
        section: users.section,
        batch: users.batch,
        phone: users.phone,
        avatarUrl: users.avatarUrl,
        isActive: users.isActive,
        mustChangePassword: users.mustChangePassword,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
        departmentId: departments.id,
        departmentCode: departments.code,
        departmentName: departments.name,
        applicationCount: sql<number>`(
          SELECT COUNT(*)::int FROM ${applications} WHERE ${applications.userId} = ${users.id}
        )`,
        savedCount: sql<number>`(
          SELECT COUNT(*)::int FROM ${savedJobs} WHERE ${savedJobs.userId} = ${users.id}
        )`,
      })
      .from(users)
      .leftJoin(departments, eq(users.departmentId, departments.id))
      .where(where)
      .orderBy(orderBy)
      .limit(query.limit)
      .offset(offset(query.page, query.limit)),
  ]);

  const items: AdminStudentRow[] = rows.map((r) => ({
    ...toPublicUser(r),
    applicationCount: Number(r.applicationCount),
    savedCount: Number(r.savedCount),
  }));

  return {
    items,
    pagination: buildPaginationMeta(query.page, query.limit, countResult[0]?.value ?? 0),
  };
}

export async function getStudent(id: string): Promise<PublicUser> {
  const row = await findById(id);
  if (!row) throw notFound('Student');
  return toPublicUser(row);
}

/**
 * Create one student by hand.
 *
 * The password is DERIVED from the USN — an admin never chooses it and never sees
 * it. There is deliberately no `password` field on the input schema, so an admin
 * cannot set a student's password to something they know.
 */
export async function createStudent(input: StudentInput): Promise<PublicUser> {
  const usn = normalizeUsn(input.usn);

  const [row] = await db
    .insert(users)
    .values({
      email: input.email.toLowerCase(),
      passwordHash: await hashPassword(usn),
      fullName: input.fullName,
      role: 'student',
      usn,
      departmentId: input.departmentId,
      year: input.year,
      section: input.section || null,
      batch: input.batch || null,
      mustChangePassword: true,
    })
    .returning({ id: users.id });

  if (!row) throw conflict('Could not create that student');

  return getStudent(row.id);
}

export async function updateStudent(id: string, input: UpdateStudentInput): Promise<PublicUser> {
  const patch: Record<string, unknown> = { updatedAt: new Date() };

  if (input.fullName !== undefined) patch.fullName = input.fullName;
  if (input.email !== undefined) patch.email = input.email.toLowerCase();
  if (input.usn !== undefined) patch.usn = normalizeUsn(input.usn);
  if (input.departmentId !== undefined) patch.departmentId = input.departmentId;
  if (input.year !== undefined) patch.year = input.year;
  if (input.section !== undefined) patch.section = input.section || null;
  if (input.batch !== undefined) patch.batch = input.batch || null;

  // Note: `passwordHash` and `mustChangePassword` are NOT assignable here.
  // Changing a password is a separate, audited action — never a side effect of
  // correcting a student's section.

  const updated = await db
    .update(users)
    .set(patch)
    .where(eq(users.id, id))
    .returning({ id: users.id });

  if (updated.length === 0) throw notFound('Student');

  return getStudent(id);
}

/**
 * Reset a student's password back to their USN.
 *
 * Re-arms `mustChangePassword`, so the account is immediately locked out of
 * everything except the change-password screen, and revokes every session — if
 * the reason for the reset was a compromise, the attacker is ejected now.
 */
export async function resetPassword(id: string): Promise<ResetPasswordResult> {
  const row = await findById(id);
  if (!row) throw notFound('Student');

  if (!row.usn) {
    throw conflict('This account has no USN, so it has no default password to reset to.');
  }

  const usn = normalizeUsn(row.usn);

  await db
    .update(users)
    .set({
      passwordHash: await hashPassword(usn),
      mustChangePassword: true,
      updatedAt: new Date(),
    })
    .where(eq(users.id, id));

  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(eq(refreshTokens.userId, id));

  return {
    message: `Password reset to the student's USN. They must change it at next sign-in.`,
    usn,
  };
}

/** Enable or disable. Disabling revokes every session immediately. */
export async function setActive(
  actorId: string,
  targetId: string,
  isActive: boolean,
): Promise<PublicUser> {
  if (actorId === targetId) throw conflict('You cannot disable your own account');

  const target = await findById(targetId);
  if (!target) throw notFound('Student');

  if (target.role === 'admin' && !isActive) {
    await assertNotLastAdmin(targetId);
  }

  await db
    .update(users)
    .set({ isActive, updatedAt: new Date() })
    .where(eq(users.id, targetId));

  if (!isActive) {
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokens.userId, targetId));
  }

  return getStudent(targetId);
}

export async function setRole(
  actorId: string,
  targetId: string,
  role: UserRole,
): Promise<PublicUser> {
  if (actorId === targetId) throw conflict('You cannot change your own role');

  const target = await findById(targetId);
  if (!target) throw notFound('Student');

  if (target.role === 'admin' && role !== 'admin') {
    await assertNotLastAdmin(targetId);
  }

  await db.update(users).set({ role, updatedAt: new Date() }).where(eq(users.id, targetId));

  // A demoted admin keeps a valid access token for up to 15 minutes. It carries
  // no authority — `requireAuth` re-reads the role from the row every request —
  // but killing the refresh tokens ends the session for real.
  if (role !== 'admin') {
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokens.userId, targetId));
  }

  return getStudent(targetId);
}

/**
 * Delete a student outright.
 *
 * Cascades to their saved jobs, applications and notifications — which is the
 * correct and honest behaviour, but it is destructive and irreversible, so it is
 * audited and the UI confirms it explicitly.
 */
export async function deleteStudent(actorId: string, targetId: string): Promise<void> {
  if (actorId === targetId) throw conflict('You cannot delete your own account');

  const target = await findById(targetId);
  if (!target) throw notFound('Student');

  if (target.role === 'admin') await assertNotLastAdmin(targetId);

  await db.delete(users).where(eq(users.id, targetId));
}

/**
 * Refuse to remove the last active admin.
 *
 * Without this, one misclick locks the entire university out of its own admin
 * panel, and the only recovery is a manual UPDATE against production.
 */
async function assertNotLastAdmin(excludingId: string): Promise<void> {
  const [remaining] = await db
    .select({ value: count() })
    .from(users)
    .where(and(eq(users.role, 'admin'), eq(users.isActive, true), ne(users.id, excludingId)));

  if ((remaining?.value ?? 0) === 0) {
    throw conflict('This is the last active admin. Promote another user first.');
  }
}
