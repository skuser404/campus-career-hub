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

/**
 * Opportunity visibility — the "everyone sees everything" model.
 *
 * Department filtering was removed by design. Every signed-in student now sees
 * every PUBLISHED opportunity, regardless of any department/year tags an admin
 * may still attach. The only visibility rule left is status: drafts stay hidden
 * from students and the direct-URL path must still enforce that.
 *
 * The fixtures deliberately still tag jobs with departments (cseOnlyY4, eceOnly)
 * to prove those tags no longer gate anything.
 */
describe('opportunity visibility (no department filtering)', () => {
  const listRoles = async (cookie: string): Promise<string[]> => {
    const res = await request(app).get('/api/v1/jobs?limit=100').set('Cookie', cookie);
    expect(res.status).toBe(200);
    return (res.body.data as Array<{ role: string }>).map((j) => j.role);
  };

  it('shows EVERY published opportunity to EVERY student, tags notwithstanding', async () => {
    // cseOnlyY4 and eceOnly still carry department tags in the fixtures; they must
    // now be visible to all four students regardless.
    for (const s of [cse4, cse2, ece4, mba1]) {
      const roles = await listRoles(s.cookie);
      expect(roles).toContain('CSE Final Year Only');
      expect(roles).toContain('ECE Only Any Year');
      expect(roles).toContain('Open To Everyone');
    }
  });

  it('lets any student open any published opportunity by its slug', async () => {
    // The old model 404'd an "ineligible" student here. There is no such thing now:
    // both the CSE-tagged and ECE-tagged postings open for every student.
    for (const s of [cse2, ece4, mba1]) {
      const cse = await request(app).get(`/api/v1/jobs/${cseOnlyY4.slug}`).set('Cookie', s.cookie);
      expect(cse.status).toBe(200);
      expect(cse.body.data.role).toBe('CSE Final Year Only');

      const ece = await request(app).get(`/api/v1/jobs/${eceOnly.slug}`).set('Cookie', s.cookie);
      expect(ece.status).toBe(200);
      expect(ece.body.data.role).toBe('ECE Only Any Year');
    }
  });

  it('lets any student save, apply to, and view any published opportunity', async () => {
    const save = await request(app)
      .post(`/api/v1/me/saved/${cseOnlyY4.id}`)
      .set('Cookie', mba1.cookie);
    expect(save.status).toBe(201);

    const apply = await request(app)
      .post('/api/v1/me/applications')
      .set('Cookie', ece4.cookie)
      .send({ jobId: cseOnlyY4.id, status: 'applied' });
    expect(apply.status).toBe(201);

    const view = await request(app)
      .post(`/api/v1/jobs/${cseOnlyY4.id}/view`)
      .set('Cookie', cse2.cookie);
    expect(view.status).toBe(204);
  });

  it('surfaces any published opportunity through full-text search for everyone', async () => {
    const res = await request(app).get('/api/v1/jobs?q=Final%20Year').set('Cookie', mba1.cookie);
    expect(res.status).toBe(200);
    expect((res.body.data as Array<{ role: string }>).map((j) => j.role)).toContain(
      'CSE Final Year Only',
    );
  });

  it('STILL hides a draft from students, list and direct URL alike', async () => {
    // Status remains a real boundary even though department is not.
    for (const s of [cse4, cse2, ece4, mba1]) {
      expect(await listRoles(s.cookie)).not.toContain('Unpublished Draft');

      const direct = await request(app)
        .get(`/api/v1/jobs/${draftJob.slug}`)
        .set('Cookie', s.cookie);
      expect(direct.status).toBe(404);
    }
  });

  it('still shows an admin everything, including drafts', async () => {
    const res = await request(app).get('/api/v1/admin/jobs?limit=100').set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    const roles = (res.body.data as Array<{ role: string }>).map((j) => j.role);
    expect(roles).toContain('Unpublished Draft');
  });

  /**
   * Deadline lifecycle. A past deadline must move an opportunity OUT of the live
   * list and INTO the Closed view — without deleting it, and without breaking the
   * detail page. This is the "fix every deadline bug" requirement, pinned.
   */
  it('moves a past-deadline opportunity to Closed but keeps it openable', async () => {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString();

    const created = await request(app)
      .post('/api/v1/admin/jobs')
      .set('Cookie', adminCookie)
      .send({
        companyName: `${TAG} Expired Co`,
        role: 'Expired Role',
        description: 'A closed opportunity.',
        applicationLink: 'https://example.com/apply',
        deadline: yesterday,
        status: 'published',
        skills: [],
      });
    expect(created.status).toBe(201);
    const slug = created.body.data.slug as string;

    // Not in the live list…
    const live = await request(app).get('/api/v1/jobs?limit=100').set('Cookie', cse4.cookie);
    expect((live.body.data as Array<{ role: string }>).map((j) => j.role)).not.toContain('Expired Role');

    // …but present in the Closed view…
    const closed = await request(app)
      .get('/api/v1/jobs?closed=true&limit=100')
      .set('Cookie', cse4.cookie);
    expect((closed.body.data as Array<{ role: string }>).map((j) => j.role)).toContain('Expired Role');

    // …and the detail page still opens, so a student can still click Apply.
    const detail = await request(app).get(`/api/v1/jobs/${slug}`).set('Cookie', cse4.cookie);
    expect(detail.status).toBe(200);
    expect(detail.body.data.role).toBe('Expired Role');

    await request(app)
      .delete(`/api/v1/admin/jobs/${created.body.data.id}`)
      .set('Cookie', adminCookie);
  });
});

/**
 * WhatsApp message parsing. Pure function, so exercised directly — no HTTP.
 */
describe('WhatsApp message parser', () => {
  it('extracts the link, deadline, salary and mode from a realistic message', async () => {
    const { parseWhatsAppMessage } = await import('../modules/jobs/parser.service');

    const parsed = parseWhatsAppMessage(
      [
        '*Backend Developer Intern at Razorpay*',
        'Eligibility: 2026 & 2027 batch, CGPA 7.5+',
        'Package: 4.5 - 6 LPA',
        'Stipend: 40k/month',
        'Location: Bengaluru (Hybrid)',
        'Skills: React, Node.js, SQL',
        'Last date to apply: 25/12/2026',
        'Apply here 👇',
        'https://razorpay.com/jobs/123',
        'Join the WhatsApp group: https://chat.whatsapp.com/ABC123',
      ].join('\n'),
    );

    expect(parsed.applicationLink).toBe('https://razorpay.com/jobs/123');
    expect(parsed.whatsappGroupLink).toBe('https://chat.whatsapp.com/ABC123');
    expect(parsed.role).toBeTruthy();
    expect(parsed.companyName).toBe('Razorpay');
    expect(parsed.eligibility).toContain('2026');
    // Salary parsed as an LPA range.
    expect(parsed.salaryFromLpa).toBe(4.5);
    expect(parsed.salaryToLpa).toBe(6);
    expect(parsed.internshipStipend).toMatch(/40k/i);
    expect(parsed.batch).toMatch(/2026/);
    expect(parsed.skills).toEqual(expect.arrayContaining(['React', 'SQL']));
    expect(parsed.mode).toBe('hybrid');
    // Day-first parsing: 25 Dec, not a rolled-over month.
    expect(new Date(parsed.deadline as string).getUTCMonth()).toBe(11);
    expect(parsed.detected).toContain('applicationLink');
  });

  it('leaves fields null rather than guessing when the message is sparse', async () => {
    const { parseWhatsAppMessage } = await import('../modules/jobs/parser.service');
    const parsed = parseWhatsAppMessage('Some opportunity, ping me for details');

    expect(parsed.applicationLink).toBeNull();
    expect(parsed.deadline).toBeNull();
    expect(parsed.salaryFromLpa).toBeNull();
    expect(parsed.internshipStipend).toBeNull();
    // The description always falls back to the raw text, so nothing is lost.
    expect(parsed.description.length).toBeGreaterThan(0);
  });
});

/**
 * Google Sign-In endpoint. A real ID token cannot be minted in a test, but the
 * endpoint's guardrails can still be checked: it must reject a missing credential
 * at the schema, and fail safe (503) when no Client ID is configured — which is
 * the case in the test environment.
 */
describe('Google Sign-In endpoint', () => {
  it('rejects a request with no credential', async () => {
    const res = await request(app).post('/api/v1/auth/google').send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('fails safe with 503 when Google is not configured', async () => {
    const res = await request(app)
      .post('/api/v1/auth/google')
      .send({ credential: 'not-a-real-token' });
    expect(res.status).toBe(503);
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

  it('ignores unknown fields on a profile update (mass-assignment guard)', async () => {
    // Department filtering is gone, but the mass-assignment guard still matters:
    // the self-service profile endpoint must never accept fields it does not own
    // (role, department, year). The Zod schema strips unknown keys and the
    // service copies an explicit allowlist — two independent layers.
    await request(app)
      .patch('/api/v1/me/profile')
      .set('Cookie', mba1.cookie)
      .send({ departmentId: cseDeptId, year: 4, role: 'admin' });

    const me = await request(app).get('/api/v1/auth/me').set('Cookie', mba1.cookie);

    // None of the injected fields took effect.
    expect(me.body.data.role).toBe('student');
    expect(me.body.data.department?.code).toBe('MBA');
    expect(me.body.data.year).toBe(1);
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
