import { ERROR_CODES, type ErrorCode } from '@cch/shared';

/**
 * One error class for every expected failure.
 *
 * Handlers throw these; a single error middleware turns them into the response
 * envelope. Nothing else in the codebase constructs an error response by hand,
 * so the shape cannot drift between endpoints.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCode;
  public readonly details: Array<{ path: string; message: string }> | undefined;
  /** True for errors we intend to expose. Unexpected throws are masked. */
  public readonly isOperational = true;

  constructor(
    statusCode: number,
    code: ErrorCode,
    message: string,
    details?: Array<{ path: string; message: string }>,
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export const badRequest = (message: string, details?: Array<{ path: string; message: string }>) =>
  new AppError(400, ERROR_CODES.VALIDATION_ERROR, message, details);

export const unauthorized = (message = 'You must be signed in to do that') =>
  new AppError(401, ERROR_CODES.UNAUTHORIZED, message);

export const forbidden = (message = 'You do not have permission to do that') =>
  new AppError(403, ERROR_CODES.FORBIDDEN, message);

export const notFound = (resource = 'Resource') =>
  new AppError(404, ERROR_CODES.NOT_FOUND, `${resource} not found`);

export const conflict = (message: string) => new AppError(409, ERROR_CODES.CONFLICT, message);

export const serviceUnavailable = (message: string) =>
  new AppError(503, ERROR_CODES.SERVICE_UNAVAILABLE, message);

/**
 * The forced first-login lockout.
 *
 * A distinct code, NOT a generic 403. The web client keys on
 * `PASSWORD_CHANGE_REQUIRED` to redirect to the change-password screen; if this
 * were an ordinary FORBIDDEN it would have to parse the message text to know
 * what to do, and would show "you don't have permission" to a student whose only
 * problem is that they are still using their USN.
 */
export const passwordChangeRequired = (
  message = 'You must set a new password before continuing',
) => new AppError(403, ERROR_CODES.PASSWORD_CHANGE_REQUIRED, message);

export const accountDisabled = (
  message = 'Your account has been disabled. Contact the placement office.',
) => new AppError(403, ERROR_CODES.ACCOUNT_DISABLED, message);

export const internal = (message = 'Something went wrong') =>
  new AppError(500, ERROR_CODES.INTERNAL_ERROR, message);

/**
 * Postgres error codes we translate into clean HTTP responses rather than
 * leaking a driver stack trace.
 */
export const PG_ERRORS = {
  UNIQUE_VIOLATION: '23505',
  FOREIGN_KEY_VIOLATION: '23503',
  CHECK_VIOLATION: '23514',
  NOT_NULL_VIOLATION: '23502',
} as const;

interface PgError {
  code?: string;
  constraint?: string;
  detail?: string;
}

export const isPgError = (e: unknown): e is PgError =>
  typeof e === 'object' && e !== null && 'code' in e;

/**
 * Map a database constraint violation to a message a human can act on.
 *
 * The constraint names here are the ones declared in `db/schema.ts`. This is
 * the payoff for naming them explicitly: a race that slips past an application
 * check still surfaces as "You have already applied" rather than a 500.
 */
export function mapDatabaseError(e: unknown): AppError | null {
  if (!isPgError(e) || !e.code) return null;

  if (e.code === PG_ERRORS.UNIQUE_VIOLATION) {
    switch (e.constraint) {
      case 'users_email_unique_idx':
        return conflict('An account with that email already exists');
      case 'applications_user_job_unique_idx':
        return conflict('You have already applied to this opportunity');
      case 'saved_jobs_user_id_job_id_pk':
        return conflict('This opportunity is already saved');
      case 'companies_slug_unique_idx':
      case 'companies_name_unique_idx':
        return conflict('A company with that name already exists');
      case 'categories_slug_unique_idx':
      case 'categories_name_unique_idx':
        return conflict('A category with that name already exists');
      case 'tags_slug_unique_idx':
      case 'tags_name_unique_idx':
        return conflict('A tag with that name already exists');
      case 'jobs_slug_unique_idx':
        return conflict('An opportunity with that title already exists for this company');
      default:
        return conflict('That record already exists');
    }
  }

  if (e.code === PG_ERRORS.FOREIGN_KEY_VIOLATION) {
    // ON DELETE RESTRICT firing: the caller tried to delete something still in use.
    if (e.constraint === 'jobs_company_id_companies_id_fk') {
      return conflict('This company still has opportunities. Remove or reassign them first.');
    }
    if (e.constraint === 'jobs_category_id_categories_id_fk') {
      return conflict('This category still has opportunities. Remove or reassign them first.');
    }
    return badRequest('That referenced record does not exist');
  }

  if (e.code === PG_ERRORS.CHECK_VIOLATION) {
    switch (e.constraint) {
      case 'jobs_salary_range_valid':
        return badRequest('Maximum salary must be greater than or equal to the minimum');
      case 'jobs_application_link_http':
        return badRequest('The application link must start with http:// or https://');
      case 'announcements_window_valid':
      case 'banners_window_valid':
        return badRequest('The end date must be after the start date');
      default:
        return badRequest('That data failed a validation rule');
    }
  }

  return null;
}
