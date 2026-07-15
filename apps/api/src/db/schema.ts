import {
  ANNOUNCEMENT_PRIORITIES,
  APPLICATION_STATUSES,
  COLLEGE_EMAIL_DOMAIN,
  JOB_MODES,
  JOB_STATUSES,
  NOTIFICATION_TYPES,
  USER_ROLES,
} from '@cch/shared';
import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  char,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Postgres enum types, derived from the shared constants so the database and the
 * application can never disagree about what a valid status is.
 */
export const userRoleEnum = pgEnum('user_role', USER_ROLES);
export const jobModeEnum = pgEnum('job_mode', JOB_MODES);
export const jobStatusEnum = pgEnum('job_status', JOB_STATUSES);
export const applicationStatusEnum = pgEnum('application_status', APPLICATION_STATUSES);
export const announcementPriorityEnum = pgEnum('announcement_priority', ANNOUNCEMENT_PRIORITIES);
export const notificationTypeEnum = pgEnum('notification_type', NOTIFICATION_TYPES);

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

// ─────────────────────────────────────────────────────────────────────────
// departments — CSE, ISE, AIML, CTIS, ECE, MBA…
// ─────────────────────────────────────────────────────────────────────────

export const departments = pgTable(
  'departments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps,
  },
  (t) => [
    // The import resolves a department by CODE, so this uniqueness is what makes
    // "CSE" an unambiguous key across a 1,400-row spreadsheet.
    uniqueIndex('departments_code_unique_idx').on(sql`upper(${t.code})`),
    uniqueIndex('departments_slug_unique_idx').on(t.slug),
    index('departments_sort_idx').on(t.sortOrder),
  ],
);

// ─────────────────────────────────────────────────────────────────────────
// users — students and admins
// ─────────────────────────────────────────────────────────────────────────

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    fullName: text('full_name').notNull(),
    role: userRoleEnum('role').notNull().default('student'),

    /** The student's real institutional identity. Null for admin accounts. */
    usn: text('usn'),

    // `set null` rather than cascade: deleting a department must never delete the
    // students in it. The rows survive, orphaned and visible, so an admin can
    // reassign them.
    departmentId: uuid('department_id').references(() => departments.id, {
      onDelete: 'set null',
    }),
    year: smallint('year'),
    section: text('section'),
    batch: text('batch'),

    phone: text('phone'),
    avatarUrl: text('avatar_url'),
    isActive: boolean('is_active').notNull().default(true),

    /**
     * True from the moment an account is imported until the student replaces the
     * USN default.
     *
     * Defaults to TRUE, which is the only safe default: a row inserted by any
     * path that forgets to set it is treated as still holding a known password,
     * and is locked out of everything until it is changed.
     */
    mustChangePassword: boolean('must_change_password').notNull().default(true),

    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('users_email_unique_idx').on(sql`lower(${t.email})`),

    // Partial unique index: USN is unique among students, but admins have none,
    // and a plain unique index would allow only ONE null-USN admin in Postgres…
    // actually it would allow many, but this states the intent precisely and
    // keeps the index small.
    uniqueIndex('users_usn_unique_idx')
      .on(sql`upper(${t.usn})`)
      .where(sql`${t.usn} IS NOT NULL`),

    index('users_role_idx').on(t.role),
    index('users_department_idx').on(t.departmentId),
    // The composite index behind the eligibility check on every job query.
    index('users_dept_year_idx').on(t.departmentId, t.year),
    index('users_is_active_idx').on(t.isActive),
    index('users_must_change_idx').on(t.mustChangePassword),

    check('users_year_range', sql`${t.year} IS NULL OR (${t.year} BETWEEN 1 AND 4)`),

    /**
     * A STUDENT must hold a college email. Enforced in the database, not only in
     * Zod, because the bulk import writes thousands of rows at once and a single
     * missed validation there would admit an outsider to the entire system.
     *
     * Admins are exempt: the platform operator may not be on the student roll.
     *
     * `sql.raw` is REQUIRED here, not a shortcut. A plain `${...}` interpolation
     * makes Drizzle emit a bind parameter (`LIKE $1`), and DDL cannot carry bind
     * parameters — the constraint would be generated broken and this entire
     * defence would silently not exist. `COLLEGE_EMAIL_DOMAIN` is a compile-time
     * constant, never user input, so inlining it is safe.
     */
    check(
      'users_student_email_domain',
      sql`${t.role} <> 'student' OR lower(${t.email}) LIKE ${sql.raw(`'%@${COLLEGE_EMAIL_DOMAIN}'`)}`,
    ),

    /** A student must have a USN. An account with no institutional identity is not a student. */
    check('users_student_has_usn', sql`${t.role} <> 'student' OR ${t.usn} IS NOT NULL`),
  ],
);

// ─────────────────────────────────────────────────────────────────────────
// companies
// ─────────────────────────────────────────────────────────────────────────

export const companies = pgTable(
  'companies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    logoUrl: text('logo_url'),
    website: text('website'),
    description: text('description'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('companies_slug_unique_idx').on(t.slug),
    uniqueIndex('companies_name_unique_idx').on(sql`lower(${t.name})`),
  ],
);

// ─────────────────────────────────────────────────────────────────────────
// categories — Placement, Internship, Hackathon, Certification, Workshop, Event
// ─────────────────────────────────────────────────────────────────────────

export const categories = pgTable(
  'categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description'),
    color: text('color'),
    icon: text('icon'),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('categories_slug_unique_idx').on(t.slug),
    uniqueIndex('categories_name_unique_idx').on(sql`lower(${t.name})`),
    index('categories_sort_order_idx').on(t.sortOrder),
  ],
);

// ─────────────────────────────────────────────────────────────────────────
// tags
// ─────────────────────────────────────────────────────────────────────────

export const tags = pgTable(
  'tags',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    createdAt: timestamps.createdAt,
  },
  (t) => [
    uniqueIndex('tags_slug_unique_idx').on(t.slug),
    uniqueIndex('tags_name_unique_idx').on(sql`lower(${t.name})`),
  ],
);

// ─────────────────────────────────────────────────────────────────────────
// jobs — the core opportunity record
// ─────────────────────────────────────────────────────────────────────────

export const jobs = pgTable(
  'jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull(),

    // `restrict`: deleting a company that still has opportunities must fail
    // loudly rather than silently cascade-destroying student application history.
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'restrict' }),

    role: text('role').notNull(),
    description: text('description').notNull(),
    eligibility: text('eligibility'),

    salaryMin: integer('salary_min'),
    salaryMax: integer('salary_max'),
    salaryCurrency: char('salary_currency', { length: 3 }).notNull().default('INR'),
    salaryText: text('salary_text'),

    location: text('location'),
    mode: jobModeEnum('mode').notNull().default('onsite'),
    deadline: timestamp('deadline', { withTimezone: true }),
    applicationLink: text('application_link').notNull(),
    imageUrl: text('image_url'),
    status: jobStatusEnum('status').notNull().default('draft'),
    isFeatured: boolean('is_featured').notNull().default(false),

    postedBy: uuid('posted_by').references(() => users.id, { onDelete: 'set null' }),
    viewsCount: integer('views_count').notNull().default(0),

    ...timestamps,
  },
  (t) => [
    uniqueIndex('jobs_slug_unique_idx').on(t.slug),

    index('jobs_status_deadline_idx').on(t.status, t.deadline),
    index('jobs_category_idx').on(t.categoryId),
    index('jobs_company_idx').on(t.companyId),
    index('jobs_created_at_idx').on(t.createdAt.desc()),
    index('jobs_featured_idx').on(t.isFeatured, t.status),

    // Real full-text search. Without this, `q=` degrades to a sequential scan
    // with LIKE '%...%', which stops being viable at a few thousand rows.
    index('jobs_search_idx').using(
      'gin',
      sql`to_tsvector('english',
        coalesce(${t.role}, '') || ' ' ||
        coalesce(${t.description}, '') || ' ' ||
        coalesce(${t.eligibility}, '') || ' ' ||
        coalesce(${t.location}, ''))`,
    ),

    check(
      'jobs_salary_range_valid',
      sql`${t.salaryMin} IS NULL OR ${t.salaryMax} IS NULL OR ${t.salaryMax} >= ${t.salaryMin}`,
    ),
    check(
      'jobs_salary_non_negative',
      sql`(${t.salaryMin} IS NULL OR ${t.salaryMin} >= 0) AND (${t.salaryMax} IS NULL OR ${t.salaryMax} >= 0)`,
    ),
    // Defence in depth against a stored `javascript:` URL becoming a click target.
    check('jobs_application_link_http', sql`${t.applicationLink} ~* '^https?://'`),
  ],
);

// ─────────────────────────────────────────────────────────────────────────
// job_departments — WHO MAY SEE THIS OPPORTUNITY
//
// This is not a tag. It is an access-control list, and it is the reason an ISE
// student cannot see a CSE-only posting. NO ROWS = visible to every department.
// ─────────────────────────────────────────────────────────────────────────

export const jobDepartments = pgTable(
  'job_departments',
  {
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    departmentId: uuid('department_id')
      .notNull()
      .references(() => departments.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.jobId, t.departmentId] }),
    // The reverse lookup that the student's job query runs on every page load.
    index('job_departments_dept_idx').on(t.departmentId),
  ],
);

// ─────────────────────────────────────────────────────────────────────────
// job_years — WHICH YEARS MAY SEE IT. No rows = every year.
// ─────────────────────────────────────────────────────────────────────────

export const jobYears = pgTable(
  'job_years',
  {
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    year: smallint('year').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.jobId, t.year] }),
    index('job_years_year_idx').on(t.year),
    check('job_years_range', sql`${t.year} BETWEEN 1 AND 4`),
  ],
);

// ─────────────────────────────────────────────────────────────────────────
// job_tags — many-to-many
// ─────────────────────────────────────────────────────────────────────────

export const jobTags = pgTable(
  'job_tags',
  {
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.jobId, t.tagId] }), index('job_tags_tag_idx').on(t.tagId)],
);

// ─────────────────────────────────────────────────────────────────────────
// saved_jobs — bookmarks
// ─────────────────────────────────────────────────────────────────────────

export const savedJobs = pgTable(
  'saved_jobs',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    createdAt: timestamps.createdAt,
  },
  (t) => [
    // The composite primary key makes double-saving impossible in the database,
    // so POST /me/saved/:jobId is idempotent without a read-then-write race.
    primaryKey({ columns: [t.userId, t.jobId] }),
    index('saved_jobs_user_idx').on(t.userId, t.createdAt.desc()),
    index('saved_jobs_job_idx').on(t.jobId),
  ],
);

// ─────────────────────────────────────────────────────────────────────────
// applications — "Mark as Applied" with a real lifecycle
// ─────────────────────────────────────────────────────────────────────────

export const applications = pgTable(
  'applications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    status: applicationStatusEnum('status').notNull().default('applied'),
    notes: text('notes'),
    appliedAt: timestamp('applied_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamps.updatedAt,
  },
  (t) => [
    // One application per student per opportunity — enforced by the database,
    // not by hopeful application code.
    uniqueIndex('applications_user_job_unique_idx').on(t.userId, t.jobId),
    index('applications_user_idx').on(t.userId, t.appliedAt.desc()),
    index('applications_job_idx').on(t.jobId),
    index('applications_status_idx').on(t.status),
  ],
);

// ─────────────────────────────────────────────────────────────────────────
// notifications — one row per student, fanned out on write
// ─────────────────────────────────────────────────────────────────────────

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: notificationTypeEnum('type').notNull(),
    title: text('title').notNull(),
    body: text('body'),
    /** An in-app path. Never an external URL — that would make this a phishing vector. */
    link: text('link'),
    isRead: boolean('is_read').notNull().default(false),
    createdAt: timestamps.createdAt,
  },
  (t) => [
    index('notifications_user_created_idx').on(t.userId, t.createdAt.desc()),
    // Partial index: the unread badge is the hottest read in the app, and it only
    // ever cares about unread rows. Indexing the read ones too would be dead weight.
    index('notifications_unread_idx')
      .on(t.userId)
      .where(sql`${t.isRead} = false`),
  ],
);

// ─────────────────────────────────────────────────────────────────────────
// announcements
// ─────────────────────────────────────────────────────────────────────────

export const announcements = pgTable(
  'announcements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    priority: announcementPriorityEnum('priority').notNull().default('normal'),
    isActive: boolean('is_active').notNull().default(true),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [
    index('announcements_active_idx').on(t.isActive, t.startsAt, t.endsAt),
    check(
      'announcements_window_valid',
      sql`${t.startsAt} IS NULL OR ${t.endsAt} IS NULL OR ${t.endsAt} > ${t.startsAt}`,
    ),
  ],
);

// ─────────────────────────────────────────────────────────────────────────
// banners
// ─────────────────────────────────────────────────────────────────────────

export const banners = pgTable(
  'banners',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    imageUrl: text('image_url').notNull(),
    linkUrl: text('link_url'),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index('banners_active_sort_idx').on(t.isActive, t.sortOrder),
    check(
      'banners_window_valid',
      sql`${t.startsAt} IS NULL OR ${t.endsAt} IS NULL OR ${t.endsAt} > ${t.startsAt}`,
    ),
  ],
);

// ─────────────────────────────────────────────────────────────────────────
// refresh_tokens — hashed, rotating, revocable sessions
// ─────────────────────────────────────────────────────────────────────────

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // SHA-256 of the token. The raw value is never stored, so a database dump
    // does not hand an attacker a set of usable sessions.
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    userAgent: text('user_agent'),
    ip: text('ip'),
    createdAt: timestamps.createdAt,
  },
  (t) => [
    uniqueIndex('refresh_tokens_hash_unique_idx').on(t.tokenHash),
    index('refresh_tokens_user_idx').on(t.userId),
    index('refresh_tokens_expires_idx').on(t.expiresAt),
  ],
);

// ─────────────────────────────────────────────────────────────────────────
// site_settings · audit_logs · job_views
// ─────────────────────────────────────────────────────────────────────────

export const siteSettings = pgTable(
  'site_settings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: text('key').notNull(),
    value: jsonb('value').notNull(),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    updatedAt: timestamps.updatedAt,
  },
  (t) => [uniqueIndex('site_settings_key_unique_idx').on(t.key)],
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id'),
    metadata: jsonb('metadata'),
    ip: text('ip'),
    createdAt: timestamps.createdAt,
  },
  (t) => [
    index('audit_logs_actor_idx').on(t.actorId, t.createdAt.desc()),
    index('audit_logs_entity_idx').on(t.entityType, t.entityId),
    index('audit_logs_created_idx').on(t.createdAt.desc()),
  ],
);

export const jobViews = pgTable(
  'job_views',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    viewedAt: timestamp('viewed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('job_views_job_time_idx').on(t.jobId, t.viewedAt.desc()),
    index('job_views_time_idx').on(t.viewedAt.desc()),
  ],
);

// ─────────────────────────────────────────────────────────────────────────
// Relations
// ─────────────────────────────────────────────────────────────────────────

export const departmentsRelations = relations(departments, ({ many }) => ({
  students: many(users),
  jobDepartments: many(jobDepartments),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  department: one(departments, { fields: [users.departmentId], references: [departments.id] }),
  postedJobs: many(jobs),
  savedJobs: many(savedJobs),
  applications: many(applications),
  notifications: many(notifications),
  refreshTokens: many(refreshTokens),
}));

export const companiesRelations = relations(companies, ({ many }) => ({ jobs: many(jobs) }));
export const categoriesRelations = relations(categories, ({ many }) => ({ jobs: many(jobs) }));
export const tagsRelations = relations(tags, ({ many }) => ({ jobTags: many(jobTags) }));

export const jobsRelations = relations(jobs, ({ one, many }) => ({
  company: one(companies, { fields: [jobs.companyId], references: [companies.id] }),
  category: one(categories, { fields: [jobs.categoryId], references: [categories.id] }),
  poster: one(users, { fields: [jobs.postedBy], references: [users.id] }),
  jobTags: many(jobTags),
  jobDepartments: many(jobDepartments),
  jobYears: many(jobYears),
  savedBy: many(savedJobs),
  applications: many(applications),
  views: many(jobViews),
}));

export const jobDepartmentsRelations = relations(jobDepartments, ({ one }) => ({
  job: one(jobs, { fields: [jobDepartments.jobId], references: [jobs.id] }),
  department: one(departments, {
    fields: [jobDepartments.departmentId],
    references: [departments.id],
  }),
}));

export const jobYearsRelations = relations(jobYears, ({ one }) => ({
  job: one(jobs, { fields: [jobYears.jobId], references: [jobs.id] }),
}));

export const jobTagsRelations = relations(jobTags, ({ one }) => ({
  job: one(jobs, { fields: [jobTags.jobId], references: [jobs.id] }),
  tag: one(tags, { fields: [jobTags.tagId], references: [tags.id] }),
}));

export const savedJobsRelations = relations(savedJobs, ({ one }) => ({
  user: one(users, { fields: [savedJobs.userId], references: [users.id] }),
  job: one(jobs, { fields: [savedJobs.jobId], references: [jobs.id] }),
}));

export const applicationsRelations = relations(applications, ({ one }) => ({
  user: one(users, { fields: [applications.userId], references: [users.id] }),
  job: one(jobs, { fields: [applications.jobId], references: [jobs.id] }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
}));

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, { fields: [refreshTokens.userId], references: [users.id] }),
}));

export const jobViewsRelations = relations(jobViews, ({ one }) => ({
  job: one(jobs, { fields: [jobViews.jobId], references: [jobs.id] }),
  user: one(users, { fields: [jobViews.userId], references: [users.id] }),
}));

// Row types, inferred straight from the tables.
export type UserRow = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type DepartmentRow = typeof departments.$inferSelect;
export type JobRow = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
export type CompanyRow = typeof companies.$inferSelect;
export type CategoryRow = typeof categories.$inferSelect;
export type TagRow = typeof tags.$inferSelect;
export type ApplicationRow = typeof applications.$inferSelect;
export type NotificationRow = typeof notifications.$inferSelect;
export type AnnouncementRow = typeof announcements.$inferSelect;
export type BannerRow = typeof banners.$inferSelect;
export type RefreshTokenRow = typeof refreshTokens.$inferSelect;
