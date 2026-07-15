import { eq, sql } from 'drizzle-orm';
import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { closeDatabase, db } from '../db/client';
import {
  categories,
  companies,
  departments,
  jobDepartments,
  jobYears,
  jobs,
  users,
} from '../db/schema';
import { hashPassword } from '../lib/password';

/**
 * Integration tests — real HTTP, real Postgres, no mocks.
 *
 * The centrepiece is the cross-department leak suite. Department gating is the
 * security property this entire system exists to provide, and it is the one that
 * a typecheck, a lint and a unit test are all completely blind to.
 */

const app: Express = createApp();
const PASS = 'Str0ngPass';

/** Everything this suite creates is prefixed, so cleanup cannot touch real data. */
const TAG = `t${Date.now().toString(36)}`;

interface Student {
  id: string;
  email: string;
  cookie: string;
  dept: string;
  year: number;
}

let cseDeptId: string;
let eceDeptId: string;
let mbaDeptId: string;
let companyId: string;
let categoryId: string;
let adminId: string;
let adminCookie: string;

/** CSE year 4, CSE year 2, ECE year 4, MBA year 1 — the four corners of the matrix. */
let cse4: Student;
let cse2: Student;
let ece4: Student;
let mba1: Student;

/** Restricted opportunities. */
let cseOnlyY4: { id: string; slug: string };
let eceOnly: { id: string; slug: string };
let openToAll: { id: string; slug: string };
let draftJob: { id: string; slug: string };

const cookieOf = (res: request.Response): string => {
  const raw = res.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return list.map((c) => c.split(';')[0]).join('; ');
};

async function makeStudent(
  name: string,
  usn: string,
  departmentId: string,
  dept: string,
  year: number,
): Promise<Student> {
  const email = `${TAG}.${usn.toLowerCase()}@jainuniversity.ac.in`;

  const [row] = await db
    .insert(users)
    .values({
      email,
      passwordHash: await hashPassword(PASS),
      fullName: name,
      role: 'student',
      usn: `${TAG}${usn}`.toUpperCase().slice(0, 20),
      departmentId,
      year,
      // Already past the forced change — these tests are about eligibility, not
      // about the lockout, which has its own suite below.
      mustChangePassword: false,
    })
    .returning({ id: users.id });

  const res = await request(app).post('/api/v1/auth/login').send({ email, password: PASS });
  expect(res.status).toBe(200);

  return { id: (row as { id: string }).id, email, cookie: cookieOf(res), dept, year };
}

async function makeJob(
  role: string,
  deptIds: string[],
  years: number[],
  status: 'published' | 'draft' = 'published',
): Promise<{ id: string; slug: string }> {
  const slug = `${TAG}-${role.toLowerCase().replace(/\s+/g, '-')}`;

  const [row] = await db
    .insert(jobs)
    .values({
      slug,
      companyId,
      categoryId,
      role,
      description: `${role} description`,
      applicationLink: 'https://example.com/apply',
      status,
      postedBy: adminId,
    })
    .returning({ id: jobs.id });

  const id = (row as { id: string }).id;

  if (deptIds.length > 0) {
    await db.insert(jobDepartments).values(deptIds.map((departmentId) => ({ jobId: id, departmentId })));
  }
  if (years.length > 0) {
    await db.insert(jobYears).values(years.map((year) => ({ jobId: id, year })));
  }

  return { id, slug };
}

beforeAll(async () => {
  // Departments — reuse the seeded ones if present, otherwise create them.
  const existing = await db.select().from(departments);
  const byCode = new Map(existing.map((d) => [d.code.toUpperCase(), d.id]));

  const ensureDept = async (code: string, name: string): Promise<string> => {
    const hit = byCode.get(code);
    if (hit) return hit;
    const [row] = await db
      .insert(departments)
      .values({ code, name, slug: code.toLowerCase() })
      .returning({ id: departments.id });
    return (row as { id: string }).id;
  };

  cseDeptId = await ensureDept('CSE', 'Computer Science');
  eceDeptId = await ensureDept('ECE', 'Electronics');
  mbaDeptId = await ensureDept('MBA', 'Business Administration');

  const [company] = await db
    .insert(companies)
    .values({ name: `${TAG} Corp`, slug: `${TAG}-corp` })
    .returning({ id: companies.id });
  companyId = (company as { id: string }).id;

  const [cat] = await db
    .insert(categories)
    .values({ name: `${TAG} Placement`, slug: `${TAG}-placement` })
    .returning({ id: categories.id });
  categoryId = (cat as { id: string }).id;

  // Admin.
  const adminEmail = `${TAG}.admin@jainuniversity.ac.in`;
  const [admin] = await db
    .insert(users)
    .values({
      email: adminEmail,
      passwordHash: await hashPassword(PASS),
      fullName: 'Test Admin',
      role: 'admin',
      mustChangePassword: false,
    })
    .returning({ id: users.id });
  adminId = (admin as { id: string }).id;

  const adminLogin = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: adminEmail, password: PASS });
  expect(adminLogin.status).toBe(200);
  adminCookie = cookieOf(adminLogin);

  cse4 = await makeStudent('CSE Four', 'C4', cseDeptId, 'CSE', 4);
  cse2 = await makeStudent('CSE Two', 'C2', cseDeptId, 'CSE', 2);
  ece4 = await makeStudent('ECE Four', 'E4', eceDeptId, 'ECE', 4);
  mba1 = await makeStudent('MBA One', 'M1', mbaDeptId, 'MBA', 1);

  cseOnlyY4 = await makeJob('CSE Final Year Only', [cseDeptId], [4]);
  eceOnly = await makeJob('ECE Only Any Year', [eceDeptId], []);
  openToAll = await makeJob('Open To Everyone', [], []);
  draftJob = await makeJob('Unpublished Draft', [], [], 'draft');
});

afterAll(async () => {
  // Delete only what this run created.
  await db.delete(jobs).where(sql`${jobs.slug} LIKE ${`${TAG}%`}`);
  await db.delete(users).where(sql`${users.email} LIKE ${`${TAG}%`}`);
  await db.delete(categories).where(eq(categories.id, categoryId));
  await db.delete(companies).where(eq(companies.id, companyId));
  await closeDatabase();
});

// ═══════════════════════════════════════════════════════════════════════
// The security property this system exists to provide.
// ═══════════════════════════════════════════════════════════════════════

describe('department & year eligibility', () => {
  const listRoles = async (cookie: string): Promise<string[]> => {
    const res = await request(app)
      .get('/api/v1/jobs?limit=100')
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    return (res.body.data as Array<{ role: string }>).map((j) => j.role);
  };

  it('shows a CSE year-4 student the CSE year-4 posting', async () => {
    expect(await listRoles(cse4.cookie)).toContain('CSE Final Year Only');
  });

  it('HIDES the CSE year-4 posting from a CSE year-2 student', async () => {
    // Right department, wrong year. Both dimensions must hold, not just one.
    expect(await listRoles(cse2.cookie)).not.toContain('CSE Final Year Only');
  });

  it('HIDES the CSE posting from an ECE year-4 student', async () => {
    // Right year, wrong department.
    expect(await listRoles(ece4.cookie)).not.toContain('CSE Final Year Only');
  });

  it('HIDES the ECE posting from a CSE student', async () => {
    expect(await listRoles(cse4.cookie)).not.toContain('ECE Only Any Year');

    // And by its direct URL, which is the case a pasted link would hit.
    const direct = await request(app)
      .get(`/api/v1/jobs/${eceOnly.slug}`)
      .set('Cookie', cse4.cookie);
    expect(direct.status).toBe(404);
  });

  it('shows the ECE posting to an ECE student of ANY year', async () => {
    // `years: []` on that posting means every year — so this must pass for a
    // student whose year was never explicitly listed.
    const res = await request(app)
      .get(`/api/v1/jobs/${eceOnly.slug}`)
      .set('Cookie', ece4.cookie);

    expect(res.status).toBe(200);
    expect(res.body.data.years).toEqual([]);
  });

  it('shows an unrestricted posting to EVERY department and year', async () => {
    // The most important default in the system. An empty eligibility list means
    // "everyone" — get this backwards and every new posting is invisible to the
    // entire university.
    for (const s of [cse4, cse2, ece4, mba1]) {
      expect(await listRoles(s.cookie)).toContain('Open To Everyone');
    }
  });

  it('never shows a draft to any student, even by its direct URL', async () => {
    for (const s of [cse4, cse2, ece4, mba1]) {
      expect(await listRoles(s.cookie)).not.toContain('Unpublished Draft');

      // The draft is open to every department and year — so ONLY its status is
      // keeping it hidden. If the status filter ever regresses, this catches it
      // even though the eligibility filter would happily let it through.
      const direct = await request(app)
        .get(`/api/v1/jobs/${draftJob.slug}`)
        .set('Cookie', s.cookie);

      expect(direct.status).toBe(404);
    }
  });

  it('shows an admin everything, including drafts', async () => {
    const res = await request(app)
      .get('/api/v1/admin/jobs?limit=100')
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    const roles = (res.body.data as Array<{ role: string }>).map((j) => j.role);

    expect(roles).toContain('CSE Final Year Only');
    expect(roles).toContain('ECE Only Any Year');
    expect(roles).toContain('Unpublished Draft');
  });

  // ── The direct-URL attack ────────────────────────────────────────────
  //
  // A list filter that a detail page does not repeat is not a security control.
  // This is the case a classmate pasting a link would hit.

  it('404s an ineligible student who opens the posting by its exact slug', async () => {
    for (const s of [cse2, ece4, mba1]) {
      const res = await request(app)
        .get(`/api/v1/jobs/${cseOnlyY4.slug}`)
        .set('Cookie', s.cookie);

      // 404, NOT 403. A 403 would confirm the opportunity exists, which tells an
      // ineligible student exactly what they are missing.
      expect(res.status).toBe(404);
    }
  });

  it('lets the eligible student open it by slug', async () => {
    const res = await request(app)
      .get(`/api/v1/jobs/${cseOnlyY4.slug}`)
      .set('Cookie', cse4.cookie);

    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('CSE Final Year Only');
  });

  it('refuses to let an ineligible student SAVE a restricted posting', async () => {
    const res = await request(app)
      .post(`/api/v1/me/saved/${cseOnlyY4.id}`)
      .set('Cookie', mba1.cookie);

    expect(res.status).toBe(404);
  });

  it('refuses to let an ineligible student APPLY to a restricted posting', async () => {
    const res = await request(app)
      .post('/api/v1/me/applications')
      .set('Cookie', mba1.cookie)
      .send({ jobId: cseOnlyY4.id, status: 'applied' });

    expect(res.status).toBe(404);
  });

  it('refuses to let an ineligible student inflate its view count', async () => {
    const res = await request(app)
      .post(`/api/v1/jobs/${cseOnlyY4.id}/view`)
      .set('Cookie', mba1.cookie);

    expect(res.status).toBe(404);
  });

  it('does not leak a restricted posting through full-text search', async () => {
    const res = await request(app)
      .get('/api/v1/jobs?q=Final%20Year')
      .set('Cookie', mba1.cookie);

    expect(res.status).toBe(200);
    const roles = (res.body.data as Array<{ role: string }>).map((j) => j.role);
    expect(roles).not.toContain('CSE Final Year Only');
  });

  it('does not leak a restricted posting through the featured rails', async () => {
    const res = await request(app).get('/api/v1/jobs/featured').set('Cookie', mba1.cookie);

    expect(res.status).toBe(200);
    const all = [
      ...res.body.data.latest,
      ...res.body.data.closingSoon,
      ...res.body.data.featured,
    ] as Array<{ role: string }>;

    expect(all.map((j) => j.role)).not.toContain('CSE Final Year Only');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Authentication
// ═══════════════════════════════════════════════════════════════════════

describe('authentication', () => {
  it('has NO registration endpoint — accounts come from admin import only', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      fullName: 'Outsider',
      email: 'outsider@jainuniversity.ac.in',
      password: PASS,
      confirmPassword: PASS,
    });

    expect(res.status).toBe(404);
  });

  it('refuses a non-college email address', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'someone@gmail.com', password: PASS });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('gives the same answer for a wrong password and an unknown account', async () => {
    const wrongPassword = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: cse4.email, password: 'WrongPass1' });

    const noSuchUser = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: `${TAG}.ghost@jainuniversity.ac.in`, password: 'WrongPass1' });

    // Distinguishing them would let an outsider enumerate the student roll.
    expect(wrongPassword.status).toBe(401);
    expect(noSuchUser.status).toBe(401);
    expect(wrongPassword.body.error.message).toBe(noSuchUser.body.error.message);
  });

  it('sets httpOnly cookies, so XSS cannot steal the session', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: cse4.email, password: PASS });

    const raw = res.headers['set-cookie'];
    const list = Array.isArray(raw) ? raw : [raw];

    expect(list.some((c) => c.startsWith('cch_access') && c.includes('HttpOnly'))).toBe(true);
    expect(list.some((c) => c.startsWith('cch_refresh') && c.includes('HttpOnly'))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// The forced first-login lockout
// ═══════════════════════════════════════════════════════════════════════

describe('forced first-login password change', () => {
  let usn: string;
  let email: string;
  let cookie: string;

  beforeAll(async () => {
    usn = `${TAG}FL01`.toUpperCase().slice(0, 20);
    email = `${TAG}.firstlogin@jainuniversity.ac.in`;

    // Exactly as the bulk import creates a student: password IS the USN.
    await db.insert(users).values({
      email,
      passwordHash: await hashPassword(usn),
      fullName: 'First Login',
      role: 'student',
      usn,
      departmentId: cseDeptId,
      year: 3,
      mustChangePassword: true,
    });

    const res = await request(app).post('/api/v1/auth/login').send({ email, password: usn });
    expect(res.status).toBe(200);
    expect(res.body.data.mustChangePassword).toBe(true);

    cookie = cookieOf(res);
  });

  it('LOCKS the student out of every endpoint until they change it', async () => {
    // This is what makes a USN-as-password survivable. Someone who guessed a
    // classmate's USN and signed in first can read absolutely nothing.
    for (const path of ['/api/v1/jobs', '/api/v1/me/stats', '/api/v1/notifications']) {
      const res = await request(app).get(path).set('Cookie', cookie);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');
    }
  });

  it('refuses to let them keep the USN as their new password', async () => {
    const res = await request(app)
      .post('/api/v1/auth/first-login')
      .set('Cookie', cookie)
      .send({ newPassword: usn, confirmPassword: usn });

    // Rejected — either by the complexity rules or by the explicit USN check.
    // Ending this flow where you started it would defeat the entire point.
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('unlocks everything once a real password is set', async () => {
    const change = await request(app)
      .post('/api/v1/auth/first-login')
      .set('Cookie', cookie)
      .send({ newPassword: 'BrandNew1', confirmPassword: 'BrandNew1' });

    expect(change.status).toBe(200);
    expect(change.body.data.user.mustChangePassword).toBe(false);

    const fresh = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: 'BrandNew1' });

    expect(fresh.status).toBe(200);
    expect(fresh.body.data.mustChangePassword).toBe(false);

    const jobsRes = await request(app).get('/api/v1/jobs').set('Cookie', cookieOf(fresh));
    expect(jobsRes.status).toBe(200);
  });

  it('invalidates the old USN password afterwards', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email, password: usn });
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Authorisation
// ═══════════════════════════════════════════════════════════════════════

describe('authorisation', () => {
  it('refuses an anonymous caller everywhere — this is a closed system', async () => {
    for (const path of [
      '/api/v1/jobs',
      '/api/v1/me/stats',
      '/api/v1/notifications',
      '/api/v1/companies',
      '/api/v1/departments',
    ]) {
      const res = await request(app).get(path);
      expect(res.status).toBe(401);
    }
  });

  it('refuses a student every admin endpoint', async () => {
    for (const path of [
      '/api/v1/admin/jobs',
      '/api/v1/admin/students',
      '/api/v1/admin/departments',
      '/api/v1/admin/analytics/overview',
      '/api/v1/admin/settings',
    ]) {
      const res = await request(app).get(path).set('Cookie', cse4.cookie);
      expect(res.status).toBe(403);
    }
  });

  it('does NOT let a student escalate to admin via the profile endpoint', async () => {
    await request(app)
      .patch('/api/v1/me/profile')
      .set('Cookie', cse4.cookie)
      .send({ role: 'admin', isActive: true, phone: '+91 90000 00000' });

    const me = await request(app).get('/api/v1/auth/me').set('Cookie', cse4.cookie);

    // The Zod schema strips unknown keys, and the service copies an explicit
    // allowlist. Two independent layers, both of which must fail for this to work.
    expect(me.body.data.role).toBe('student');
  });

  it('does NOT let a student change their own department to see other postings', async () => {
    await request(app)
      .patch('/api/v1/me/profile')
      .set('Cookie', mba1.cookie)
      .send({ departmentId: cseDeptId, year: 4 });

    const me = await request(app).get('/api/v1/auth/me').set('Cookie', mba1.cookie);

    // If this ever passes, every department restriction in the system is void.
    expect(me.body.data.department.code).toBe('MBA');
    expect(me.body.data.year).toBe(1);

    const res = await request(app)
      .get(`/api/v1/jobs/${cseOnlyY4.slug}`)
      .set('Cookie', mba1.cookie);
    expect(res.status).toBe(404);
  });

  it('does NOT let one student touch another student\'s application', async () => {
    const created = await request(app)
      .post('/api/v1/me/applications')
      .set('Cookie', cse4.cookie)
      .send({ jobId: openToAll.id, status: 'applied' });

    expect(created.status).toBe(201);
    const applicationId = created.body.data.id;

    // Ownership is a WHERE clause, so someone else's id matches no row.
    const patch = await request(app)
      .patch(`/api/v1/me/applications/${applicationId}`)
      .set('Cookie', ece4.cookie)
      .send({ status: 'offered' });

    expect(patch.status).toBe(404);

    const del = await request(app)
      .delete(`/api/v1/me/applications/${applicationId}`)
      .set('Cookie', ece4.cookie);

    expect(del.status).toBe(404);
  });

  it('enforces one application per student per opportunity', async () => {
    const again = await request(app)
      .post('/api/v1/me/applications')
      .set('Cookie', cse4.cookie)
      .send({ jobId: openToAll.id, status: 'applied' });

    // The unique index is the authority, so two simultaneous clicks cannot both insert.
    expect(again.status).toBe(409);
  });

  it('caps the page limit, so a client cannot request the whole table', async () => {
    const res = await request(app)
      .get('/api/v1/jobs?limit=100000')
      .set('Cookie', cse4.cookie);

    expect(res.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Cross-origin defence
// ═══════════════════════════════════════════════════════════════════════

describe('cross-origin defence', () => {
  it('allows the configured web origin with credentials', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', 'http://localhost:3000')
      .send({ email: cse4.email, password: PASS });

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    // Without this the browser discards the response and cookie auth silently dies.
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('refuses a mutation from an unlisted origin with 403, not 500', async () => {
    // The auth cookies must be SameSite=None in production (Vercel and Render are
    // different sites), so SameSite gives no CSRF protection — the Origin check IS
    // the protection, and a browser will not let evil.com forge that header.
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', 'https://evil.com')
      .send({ email: cse4.email, password: PASS });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('health', () => {
  it('reports the database as up', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.database).toBe('up');
  });
});
