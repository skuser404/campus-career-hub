/**
 * Domain constants.
 *
 * These arrays are the authority for every enum in the system. The Postgres
 * enum types, the Zod schemas, and the TypeScript unions are all derived from
 * them, so adding a value here is the only edit required to add it everywhere.
 */

export const USER_ROLES = ['student', 'admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const JOB_MODES = ['onsite', 'remote', 'hybrid', 'not_mentioned'] as const;
export type JobMode = (typeof JOB_MODES)[number];

export const JOB_STATUSES = ['draft', 'published', 'closed', 'archived'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const APPLICATION_STATUSES = [
  'applied',
  'interviewing',
  'offered',
  'rejected',
  'withdrawn',
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const ANNOUNCEMENT_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export type AnnouncementPriority = (typeof ANNOUNCEMENT_PRIORITIES)[number];

export const JOB_SORT_OPTIONS = ['newest', 'deadline', 'salary', 'popular'] as const;
export type JobSort = (typeof JOB_SORT_OPTIONS)[number];

export const NOTIFICATION_TYPES = [
  'new_opportunity',
  'deadline_soon',
  'announcement',
  'application_update',
  'account',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

// ─────────────────────────────────────────────────────────────────────────
// Institution
// ─────────────────────────────────────────────────────────────────────────

/**
 * The ONLY email domain permitted to sign in.
 *
 * Enforced in three places, deliberately: the Zod schema (so a bad address is
 * rejected at the edge), the login service (so an imported row with a rogue
 * domain still cannot authenticate), and a database CHECK constraint (so a row
 * inserted by hand cannot bypass either). A single guard would be one refactor
 * away from being removed.
 */
export const COLLEGE_EMAIL_DOMAIN = 'jainuniversity.ac.in';

export const isCollegeEmail = (email: string): boolean =>
  email.trim().toLowerCase().endsWith(`@${COLLEGE_EMAIL_DOMAIN}`);

/** Seeded departments. Admins may add more at runtime. */
export const DEFAULT_DEPARTMENTS = [
  { code: 'CSE', name: 'Computer Science & Engineering' },
  { code: 'ISE', name: 'Information Science & Engineering' },
  { code: 'AIML', name: 'Artificial Intelligence & Machine Learning' },
  { code: 'CTIS', name: 'Computer Technology & Information Security' },
  { code: 'ECE', name: 'Electronics & Communication Engineering' },
  { code: 'MBA', name: 'Master of Business Administration' },
] as const;

/** Academic years. A postgraduate MBA runs 1–2; engineering runs 1–4. */
export const ACADEMIC_YEARS = [1, 2, 3, 4] as const;
export type AcademicYear = (typeof ACADEMIC_YEARS)[number];

export const YEAR_LABELS: Record<number, string> = {
  1: '1st Year',
  2: '2nd Year',
  3: '3rd Year',
  4: '4th Year',
};

/**
 * USN — University Seat Number. The student's real identity.
 *
 * Format: 22BTRCS001 — two-digit admission year, programme code, branch, serial.
 * The pattern is intentionally permissive on the middle segment because Jain
 * issues several programme codes, and a too-strict regex would silently reject
 * legitimate students at import time — the worst possible failure mode for a
 * bulk operation.
 */
export const USN_PATTERN = /^[0-9]{2}[A-Z]{2,6}[A-Z0-9]{2,8}$/i;

export const normalizeUsn = (usn: string): string => usn.trim().toUpperCase();

/** Categories created by the seed. Admins may add more at runtime. */
export const DEFAULT_CATEGORIES = [
  { name: 'Placement', slug: 'placement', color: '#2563eb', icon: 'Briefcase' },
  { name: 'Internship', slug: 'internship', color: '#7c3aed', icon: 'GraduationCap' },
  { name: 'Hackathon', slug: 'hackathon', color: '#db2777', icon: 'Code2' },
  { name: 'Certification', slug: 'certification', color: '#059669', icon: 'BadgeCheck' },
  { name: 'Workshop', slug: 'workshop', color: '#0891b2', icon: 'Presentation' },
  { name: 'Event', slug: 'event', color: '#ea580c', icon: 'CalendarDays' },
] as const;

/** Pagination bounds. `MAX_LIMIT` is enforced server-side: a client cannot ask for more. */
export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 12,
  MAX_LIMIT: 100,
} as const;

/** Field length caps. Mirrored by database column constraints. */
export const LIMITS = {
  EMAIL_MAX: 254,
  PASSWORD_MIN: 8,
  PASSWORD_MAX: 128,
  NAME_MIN: 2,
  NAME_MAX: 100,
  USN_MAX: 20,
  SECTION_MAX: 10,
  BATCH_MAX: 20,
  ROLE_TITLE_MAX: 200,
  DESCRIPTION_MAX: 10_000,
  ELIGIBILITY_MAX: 2_000,
  NOTES_MAX: 2_000,
  LOCATION_MAX: 200,
  URL_MAX: 2_048,
  TAGS_PER_JOB_MAX: 15,
  SEARCH_QUERY_MAX: 100,
  /** A single import may carry the whole college, but not more. */
  IMPORT_MAX_ROWS: 5_000,
  IMPORT_MAX_BYTES: 5 * 1024 * 1024,
} as const;

/** A deadline within this many days is surfaced as "closing soon". */
export const CLOSING_SOON_DAYS = 7;

/** Human-readable labels. Single source for UI copy, so no page invents its own wording. */
export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  applied: 'Applied',
  interviewing: 'Interviewing',
  offered: 'Offer received',
  rejected: 'Not selected',
  withdrawn: 'Withdrawn',
};

export const JOB_MODE_LABELS: Record<JobMode, string> = {
  onsite: 'On-site',
  remote: 'Remote',
  hybrid: 'Hybrid',
  not_mentioned: 'Not mentioned',
};

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  draft: 'Draft',
  published: 'Published',
  closed: 'Closed',
  archived: 'Archived',
};

export const JOB_SORT_LABELS: Record<JobSort, string> = {
  newest: 'Newest first',
  deadline: 'Closing soonest',
  salary: 'Highest salary',
  popular: 'Most viewed',
};

export const NOTIFICATION_LABELS: Record<NotificationType, string> = {
  new_opportunity: 'New opportunity',
  deadline_soon: 'Deadline approaching',
  announcement: 'Announcement',
  application_update: 'Application update',
  account: 'Account',
};

/** Machine-readable error codes. The web app switches on these, never on message text. */
export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',

  /**
   * Distinct code, not a generic 403.
   *
   * The web client keys on this to redirect to the forced password-change
   * screen. Overloading FORBIDDEN would mean the client had to guess from the
   * message text why it was refused.
   */
  PASSWORD_CHANGE_REQUIRED: 'PASSWORD_CHANGE_REQUIRED',
  ACCOUNT_DISABLED: 'ACCOUNT_DISABLED',
} as const;
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
