import {
  DEFAULT_CATEGORIES,
  DEFAULT_DEPARTMENTS,
  DEFAULT_SITE_SETTINGS,
  normalizeUsn,
} from '@cch/shared';
import { eq, sql } from 'drizzle-orm';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import { hashPassword } from '../lib/password';
import { slugify } from '../lib/utils';
import { checkDatabaseConnection, closeDatabase, db } from './client';
import {
  announcements,
  banners,
  categories,
  companies,
  departments,
  jobDepartments,
  jobTags,
  jobYears,
  jobs,
  siteSettings,
  tags,
  users,
} from './schema';

/**
 * Idempotent seed.
 *
 * Every insert is an upsert or guarded by an existence check, so running it twice
 * changes nothing and never fails. That matters: it runs on a fresh developer
 * machine, and it will get run against staging twice by accident.
 */

const COMPANY_SEED = [
  { name: 'Google', website: 'https://careers.google.com', description: 'Search, cloud, and everything in between.' },
  { name: 'Microsoft', website: 'https://careers.microsoft.com', description: 'Cloud, productivity, and developer tools.' },
  { name: 'Amazon', website: 'https://amazon.jobs', description: 'E-commerce and AWS cloud infrastructure.' },
  { name: 'Infosys', website: 'https://infosys.com/careers', description: 'Global IT consulting and services.' },
  { name: 'TCS', website: 'https://tcs.com/careers', description: 'India’s largest IT services company.' },
  { name: 'Zoho', website: 'https://zoho.com/careers', description: 'Bootstrapped SaaS suite, built in India.' },
  { name: 'Deloitte', website: 'https://deloitte.com/careers', description: 'Audit, consulting and advisory.' },
  { name: 'Razorpay', website: 'https://razorpay.com/jobs', description: 'Payments infrastructure for India.' },
];

const TAG_SEED = [
  'React', 'Node.js', 'Python', 'Java', 'DSA', 'SQL', 'Machine Learning',
  'Cloud', 'DevOps', 'Full Stack', 'Frontend', 'Backend', 'Cybersecurity',
  'Embedded', 'Analytics', 'Finance', 'Freshers', 'Paid',
];

/** Deadlines are relative to run time, so a seeded database always has live opportunities. */
const daysFromNow = (n: number) => new Date(Date.now() + n * 86_400_000);

async function seedDepartments() {
  for (const [i, d] of DEFAULT_DEPARTMENTS.entries()) {
    await db
      .insert(departments)
      .values({ code: d.code, name: d.name, slug: slugify(d.code), sortOrder: i })
      .onConflictDoNothing({ target: departments.slug });
  }
  logger.info(`✓ ${DEFAULT_DEPARTMENTS.length} departments`);
}

async function seedCategories() {
  for (const [i, cat] of DEFAULT_CATEGORIES.entries()) {
    await db
      .insert(categories)
      .values({ name: cat.name, slug: cat.slug, color: cat.color, icon: cat.icon, sortOrder: i })
      .onConflictDoNothing({ target: categories.slug });
  }
  logger.info(`✓ ${DEFAULT_CATEGORIES.length} categories`);
}

async function seedCompanies() {
  for (const c of COMPANY_SEED) {
    await db
      .insert(companies)
      .values({ name: c.name, slug: slugify(c.name), website: c.website, description: c.description })
      .onConflictDoNothing({ target: companies.slug });
  }
  logger.info(`✓ ${COMPANY_SEED.length} companies`);
}

async function seedTags() {
  for (const name of TAG_SEED) {
    await db
      .insert(tags)
      .values({ name, slug: slugify(name) })
      .onConflictDoNothing({ target: tags.slug });
  }
  logger.info(`✓ ${TAG_SEED.length} tags`);
}

/**
 * The admin.
 *
 * `mustChangePassword: false` — an admin's password is set from the environment,
 * not derived from a USN, so there is no known default to force them off. The
 * env schema already refuses to boot in production with the example password.
 */
async function seedAdmin(): Promise<string> {
  const email = env.SEED_ADMIN_EMAIL.toLowerCase();

  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  if (existing) {
    // Never rewrite an existing admin's password — that would silently reset a
    // real credential every time someone ran the seed.
    logger.info(`✓ admin already exists (${email})`);
    return existing.id;
  }

  const [row] = await db
    .insert(users)
    .values({
      email,
      passwordHash: await hashPassword(env.SEED_ADMIN_PASSWORD),
      fullName: env.SEED_ADMIN_NAME,
      role: 'admin',
      mustChangePassword: false,
    })
    .returning({ id: users.id });

  logger.info(`✓ admin created (${email})`);
  return (row as { id: string }).id;
}

/**
 * Demo students — one per department, so the department-gating can actually be
 * exercised by hand.
 *
 * Their password is their USN and `mustChangePassword` is true, exactly as a real
 * imported student's would be. Seeding them any other way would mean the demo
 * data does not test the code path that every real student walks through.
 */
const STUDENT_SEED = [
  { name: 'Priya Sharma',  usn: '22BTRCS001', dept: 'CSE',  year: 3, section: 'A', batch: '2022-2026' },
  { name: 'Rahul Verma',   usn: '22BTRIS014', dept: 'ISE',  year: 3, section: 'B', batch: '2022-2026' },
  { name: 'Aisha Khan',    usn: '23BTRAI007', dept: 'AIML', year: 2, section: 'A', batch: '2023-2027' },
  { name: 'Vikram Nair',   usn: '22BTRCT022', dept: 'CTIS', year: 3, section: 'A', batch: '2022-2026' },
  { name: 'Sneha Reddy',   usn: '21BTREC045', dept: 'ECE',  year: 4, section: 'C', batch: '2021-2025' },
  { name: 'Arjun Mehta',   usn: '24MBAXX012', dept: 'MBA',  year: 1, section: 'A', batch: '2024-2026' },
  { name: 'Divya Iyer',    usn: '24BTRCS118', dept: 'CSE',  year: 1, section: 'B', batch: '2024-2028' },
];

async function seedStudents(deptByCode: Map<string, string>): Promise<void> {
  const [{ value: existing } = { value: 0 }] = await db
    .select({ value: sql<number>`COUNT(*)::int` })
    .from(users)
    .where(eq(users.role, 'student'));

  if (existing > 0) {
    logger.info(`✓ ${existing} students already present — skipping`);
    return;
  }

  for (const s of STUDENT_SEED) {
    const departmentId = deptByCode.get(s.dept);
    if (!departmentId) continue;

    const usn = normalizeUsn(s.usn);
    const email = `${s.name.toLowerCase().replace(/\s+/g, '.')}@jainuniversity.ac.in`;

    await db.insert(users).values({
      email,
      // The default password IS the USN — the same rule the bulk import applies.
      passwordHash: await hashPassword(usn),
      fullName: s.name,
      role: 'student',
      usn,
      departmentId,
      year: s.year,
      section: s.section,
      batch: s.batch,
      mustChangePassword: true,
    });
  }

  logger.info(`✓ ${STUDENT_SEED.length} demo students (password = their USN)`);
}

/**
 * Opportunities, with real department and year gating so the access boundary is
 * exercised by the seed data rather than only by the tests.
 *
 * `depts: []` means open to the whole university. That is the default an admin
 * gets when they tick nothing, so the seed had better contain some.
 */
async function seedJobs(adminId: string, deptByCode: Map<string, string>) {
  const [{ value: existing } = { value: 0 }] = await db
    .select({ value: sql<number>`COUNT(*)::int` })
    .from(jobs);

  if (existing > 0) {
    logger.info(`✓ ${existing} opportunities already present — skipping`);
    return;
  }

  const companyRows = await db.select().from(companies);
  const categoryRows = await db.select().from(categories);
  const tagRows = await db.select().from(tags);

  const companyBy = (name: string) => companyRows.find((c) => c.name === name);
  const categoryBy = (slug: string) => categoryRows.find((c) => c.slug === slug);
  const tagBy = (name: string) => tagRows.find((t) => t.name === name);

  const seed = [
    {
      company: 'Google', category: 'placement',
      role: 'Software Engineer, University Graduate 2026',
      description:
        'Join Google as a new-graduate Software Engineer. You will design, develop, test, deploy and maintain software across the stack, working on problems at a scale very few companies encounter.',
      eligibility: 'B.E./B.Tech in CS, IS or AIML. Graduating 2026. Minimum 7.0 CGPA, no active backlogs.',
      salaryMin: 2_400_000, salaryMax: 3_200_000,
      location: 'Bengaluru, India', mode: 'hybrid' as const,
      deadline: daysFromNow(5),
      link: 'https://careers.google.com/jobs/results/',
      // CSE / ISE / AIML only — final year only. An ECE or MBA student will not
      // see this row, and neither will a second-year.
      depts: ['CSE', 'ISE', 'AIML'], years: [4],
      featured: true,
      tags: ['DSA', 'Java', 'Python', 'Freshers'],
    },
    {
      company: 'Microsoft', category: 'internship',
      role: 'Software Engineering Intern — Summer 2026',
      description:
        'A 12-week paid internship on a real product team. You will own a scoped project end to end, with a dedicated mentor, and present your work at the end of the programme.',
      eligibility: 'Pre-final year students. CS, IS or a related branch. Minimum 7.5 CGPA.',
      salaryMin: 100_000, salaryMax: 150_000, salaryText: 'per month',
      location: 'Hyderabad, India', mode: 'onsite' as const,
      deadline: daysFromNow(3),
      link: 'https://careers.microsoft.com/students',
      depts: ['CSE', 'ISE', 'AIML', 'CTIS'], years: [3],
      featured: true,
      tags: ['Freshers', 'Paid', 'Full Stack'],
    },
    {
      company: 'Razorpay', category: 'placement',
      role: 'Backend Engineer I',
      description:
        'Build and scale the payment infrastructure that moves money for millions of Indian businesses. High-throughput, low-latency systems where a dropped transaction is somebody’s salary.',
      eligibility: 'B.Tech 2026 graduates. Strong in one backend language.',
      salaryMin: 1_800_000, salaryMax: 2_400_000,
      location: 'Bengaluru, India', mode: 'hybrid' as const,
      deadline: daysFromNow(12),
      link: 'https://razorpay.com/jobs/',
      depts: ['CSE', 'ISE'], years: [4],
      tags: ['Backend', 'Node.js', 'SQL'],
    },
    {
      company: 'Deloitte', category: 'placement',
      role: 'Business Analyst — Consulting',
      description:
        'Work with clients across sectors on strategy, operations and technology transformation. Structured problem-solving, real client exposure from month one.',
      eligibility: 'MBA graduates, any specialisation. Strong analytical and communication skills.',
      salaryMin: 1_200_000, salaryMax: 1_600_000,
      location: 'Bengaluru / Mumbai', mode: 'onsite' as const,
      deadline: daysFromNow(15),
      link: 'https://deloitte.com/careers',
      // MBA ONLY. An engineering student must not see this.
      depts: ['MBA'], years: [],
      tags: ['Finance', 'Analytics'],
    },
    {
      company: 'Amazon', category: 'placement',
      role: 'Hardware Engineer — Devices',
      description:
        'Design and validate hardware for Amazon devices. Board bring-up, signal integrity, and working alongside firmware teams to ship at scale.',
      eligibility: 'B.E./B.Tech in Electronics & Communication. 2025 or 2026 batch.',
      salaryMin: 1_600_000, salaryMax: 2_100_000,
      location: 'Chennai, India', mode: 'onsite' as const,
      deadline: daysFromNow(20),
      link: 'https://amazon.jobs/en/teams/university-recruiting',
      // ECE ONLY.
      depts: ['ECE'], years: [4],
      tags: ['Embedded', 'Freshers'],
    },
    {
      company: 'Zoho', category: 'placement',
      role: 'Member Technical Staff',
      description:
        'Zoho hires for aptitude rather than pedigree, and trains from there. You will work across the product suite on problems that reach tens of millions of users.',
      eligibility: 'Any engineering branch, 2026 graduates. No CGPA cut-off.',
      salaryMin: 700_000, salaryMax: 1_000_000,
      location: 'Chennai, India', mode: 'onsite' as const,
      deadline: daysFromNow(25),
      link: 'https://zoho.com/careers/',
      // Open to every engineering department, final year.
      depts: [], years: [4],
      tags: ['Freshers', 'Full Stack'],
    },
    {
      company: 'Infosys', category: 'certification',
      role: 'Infosys Springboard — Full Stack Developer Certification',
      description:
        'A free, self-paced certification covering HTML, CSS, JavaScript, React, Node.js and databases. Recognised in Infosys hiring and a genuine differentiator on a fresher CV.',
      eligibility: 'Open to all students. No prerequisites.',
      salaryText: 'Free',
      location: 'Online', mode: 'remote' as const,
      deadline: daysFromNow(45),
      link: 'https://infyspringboard.onwingspan.com/',
      // OPEN TO EVERYONE — no department, no year restriction.
      depts: [], years: [],
      tags: ['React', 'Node.js', 'Full Stack'],
    },
    {
      company: 'TCS', category: 'event',
      role: 'TCS CodeVita Season 12',
      description:
        'The world’s largest programming contest. Top performers receive interview opportunities with TCS Digital at a significantly higher package than the standard fresher offer.',
      eligibility: 'All students graduating in 2026 or 2027.',
      salaryText: 'Interview opportunity + prizes',
      location: 'Online', mode: 'remote' as const,
      deadline: daysFromNow(30),
      link: 'https://tcscodevita.com/',
      depts: [], years: [3, 4],
      featured: true,
      tags: ['DSA', 'Python', 'Freshers'],
    },
    {
      company: 'Microsoft', category: 'workshop',
      role: 'Cybersecurity Fundamentals Workshop',
      description:
        'A two-day hands-on workshop covering threat modelling, secure coding and incident response, run with the Microsoft security team.',
      eligibility: 'CTIS and CSE students, any year.',
      salaryText: 'Free',
      location: 'Jain University, Bengaluru', mode: 'onsite' as const,
      deadline: daysFromNow(8),
      link: 'https://learn.microsoft.com/en-us/training/',
      depts: ['CTIS', 'CSE'], years: [],
      tags: ['Cybersecurity', 'Cloud'],
    },
    {
      company: 'Google', category: 'hackathon',
      role: 'Google Solution Challenge 2026',
      description:
        'Build a solution to one of the UN’s 17 Sustainable Development Goals using Google technologies. Global finalists receive mentorship and a cash prize.',
      eligibility: 'Open to all students. Teams of up to four.',
      salaryText: '$3,000 prize + mentorship',
      location: 'Online', mode: 'remote' as const,
      deadline: daysFromNow(2),
      link: 'https://developers.google.com/community/gdsc-solution-challenge',
      depts: [], years: [],
      tags: ['Machine Learning', 'Cloud', 'Full Stack'],
    },
  ];

  for (const s of seed) {
    const company = companyBy(s.company);
    const category = categoryBy(s.category);
    if (!company || !category) continue;

    const [row] = await db
      .insert(jobs)
      .values({
        slug: slugify(`${s.role} at ${s.company}`),
        companyId: company.id,
        categoryId: category.id,
        role: s.role,
        description: s.description,
        eligibility: s.eligibility,
        salaryMin: s.salaryMin ?? null,
        salaryMax: s.salaryMax ?? null,
        salaryText: s.salaryText ?? null,
        location: s.location,
        mode: s.mode,
        deadline: s.deadline,
        applicationLink: s.link,
        status: 'published',
        isFeatured: s.featured ?? false,
        postedBy: adminId,
      })
      .returning({ id: jobs.id });

    if (!row) continue;

    const deptIds = s.depts
      .map((code) => deptByCode.get(code))
      .filter((id): id is string => Boolean(id));

    if (deptIds.length > 0) {
      await db
        .insert(jobDepartments)
        .values(deptIds.map((departmentId) => ({ jobId: row.id, departmentId })));
    }

    if (s.years.length > 0) {
      await db.insert(jobYears).values(s.years.map((year) => ({ jobId: row.id, year })));
    }

    const tagIds = s.tags
      .map((name) => tagBy(name)?.id)
      .filter((id): id is string => Boolean(id));

    if (tagIds.length > 0) {
      await db.insert(jobTags).values(tagIds.map((tagId) => ({ jobId: row.id, tagId })));
    }
  }

  logger.info(`✓ ${seed.length} opportunities (with real department/year gating)`);
}

async function seedContent(adminId: string) {
  const [{ value: existing } = { value: 0 }] = await db
    .select({ value: sql<number>`COUNT(*)::int` })
    .from(announcements);

  if (existing === 0) {
    await db.insert(announcements).values([
      {
        title: 'Placement season 2026 is open',
        body: 'Registrations for the 2026 placement drive are live. You will only see opportunities your department and year are eligible for — if something looks missing, check with the placement office.',
        priority: 'high',
        isActive: true,
        createdBy: adminId,
      },
      {
        title: 'Change your password',
        body: 'Your first password is your USN, which is not a secret. You will be asked to set a real one the first time you sign in.',
        priority: 'urgent',
        isActive: true,
        createdBy: adminId,
      },
    ]);
    logger.info('✓ 2 announcements');
  }

  const [{ value: bannerCount } = { value: 0 }] = await db
    .select({ value: sql<number>`COUNT(*)::int` })
    .from(banners);

  if (bannerCount === 0) {
    await db.insert(banners).values([
      {
        title: 'Campus placements 2026',
        imageUrl:
          'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?w=1600&q=80&auto=format&fit=crop',
        linkUrl: '/opportunities?category=placement',
        sortOrder: 0,
        isActive: true,
      },
      {
        title: 'Summer internships now open',
        imageUrl:
          'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=1600&q=80&auto=format&fit=crop',
        linkUrl: '/opportunities?category=internship',
        sortOrder: 1,
        isActive: true,
      },
    ]);
    logger.info('✓ 2 banners');
  }

  await db
    .insert(siteSettings)
    .values({ key: 'site', value: DEFAULT_SITE_SETTINGS, updatedBy: adminId })
    .onConflictDoNothing({ target: siteSettings.key });

  logger.info('✓ site settings');
}

async function main() {
  logger.info('Seeding database…\n');

  if (!(await checkDatabaseConnection())) {
    logger.error('Cannot reach the database. Check DATABASE_URL.');
    process.exit(1);
  }

  await seedDepartments();
  await seedCategories();
  await seedCompanies();
  await seedTags();

  const deptRows = await db.select().from(departments);
  const deptByCode = new Map(deptRows.map((d) => [d.code.toUpperCase(), d.id]));

  const adminId = await seedAdmin();
  await seedStudents(deptByCode);

  await seedJobs(adminId, deptByCode);
  await seedContent(adminId);

  logger.info('\n✓ Seed complete.\n');
  logger.info(`  Admin:    ${env.SEED_ADMIN_EMAIL} / ${env.SEED_ADMIN_PASSWORD}`);
  logger.info('  Students: <name>@jainuniversity.ac.in — password is their USN');
  logger.info('            priya.sharma@jainuniversity.ac.in / 22BTRCS001  (CSE, year 3)');
  logger.info('            sneha.reddy@jainuniversity.ac.in / 21BTREC045  (ECE, year 4)');
  logger.info('            arjun.mehta@jainuniversity.ac.in / 24MBAXX012  (MBA, year 1)');
  logger.info('  Each is forced to set a new password on first sign-in.\n');
}

main()
  .catch((err) => {
    logger.error({ err }, '✗ Seed failed');
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
