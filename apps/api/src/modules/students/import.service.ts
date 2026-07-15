import {
  IMPORT_COLUMNS,
  LIMITS,
  importRowSchema,
  normalizeUsn,
  type ImportOptions,
  type ImportResult,
  type ImportRow,
  type ImportRowError,
} from '@cch/shared';
import { eq, sql } from 'drizzle-orm';
import * as XLSX from 'xlsx';
import { db } from '../../db/client';
import { departments, users } from '../../db/schema';
import { badRequest } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { hashPassword } from '../../lib/password';

/**
 * Bulk student import — the single riskiest operation in the system.
 *
 * It is the ONLY path by which a user account comes into existence, so a bug here
 * is not "some rows failed"; it is either an outsider admitted to a closed system,
 * or 1,400 students locked out on the morning of a placement drive.
 *
 * The design follows from that:
 *
 *   • Validate EVERY row before writing ANY row. A file that is half-good is
 *     rejected as a whole, so an admin never has to reason about which half landed.
 *   • Report errors by spreadsheet row number, so they can be fixed in Excel.
 *   • Offer a dry run, because "what would this do to 1,400 accounts?" is a
 *     question that deserves an answer before the fact rather than after.
 *   • Upsert by USN, never by email. A student's email can be corrected; their
 *     USN is their identity.
 */

/** Cap the error list — one malformed file must not return a 40MB payload. */
const MAX_REPORTED_ERRORS = 100;

/**
 * Map a spreadsheet header to a field.
 *
 * Registrars export from a dozen different systems, so "USN", "usn", "Reg No"
 * and "University Seat Number" all arrive. Rejecting a file because the header
 * says "Reg No" would be technically correct and practically useless.
 */
function buildHeaderMap(headers: string[]): Map<number, keyof ImportRow> {
  const map = new Map<number, keyof ImportRow>();

  headers.forEach((raw, index) => {
    const header = String(raw ?? '').trim().toLowerCase();
    if (!header) return;

    for (const [field, aliases] of Object.entries(IMPORT_COLUMNS)) {
      if ((aliases as readonly string[]).includes(header)) {
        map.set(index, field as keyof ImportRow);
        return;
      }
    }
  });

  return map;
}

interface ParsedFile {
  rows: Array<{ rowNumber: number; raw: Record<string, unknown> }>;
  missingColumns: string[];
}

/**
 * Parse CSV or XLSX from a buffer.
 *
 * `xlsx` reads both, so there is one code path rather than two — and no chance of
 * the CSV branch and the Excel branch validating differently.
 */
function parseFile(buffer: Buffer, filename: string): ParsedFile {
  let workbook: XLSX.WorkBook;

  try {
    workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  } catch {
    throw badRequest(
      `Could not read "${filename}". Upload a .csv or .xlsx file exported from Excel or Google Sheets.`,
    );
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw badRequest('That file has no sheets in it.');

  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw badRequest('That file has no sheets in it.');

  // `header: 1` gives raw arrays, so we control header matching ourselves rather
  // than letting the library guess and silently drop a column.
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    blankrows: false,
    defval: '',
  });

  if (matrix.length === 0) throw badRequest('That file is empty.');

  const headerRow = (matrix[0] ?? []).map((h) => String(h ?? ''));
  const headerMap = buildHeaderMap(headerRow);

  const mapped = new Set(headerMap.values());
  const required: Array<keyof ImportRow> = ['fullName', 'usn', 'email', 'department', 'year'];
  const missingColumns = required.filter((f) => !mapped.has(f));

  const rows: ParsedFile['rows'] = [];

  for (let i = 1; i < matrix.length; i++) {
    const cells = matrix[i] ?? [];

    // Skip genuinely blank lines — trailing empty rows are endemic in exported
    // spreadsheets and are not the admin's mistake.
    if (cells.every((c) => String(c ?? '').trim() === '')) continue;

    const raw: Record<string, unknown> = {};
    for (const [index, field] of headerMap) {
      raw[field] = cells[index];
    }

    // +1 because the array is 0-based, and the header occupies row 1 in Excel.
    // The number an admin sees in the error report must be the number they see
    // in the spreadsheet, or the report is useless.
    rows.push({ rowNumber: i + 1, raw });
  }

  return { rows, missingColumns };
}

export async function importStudents(
  buffer: Buffer,
  filename: string,
  options: ImportOptions,
): Promise<ImportResult> {
  if (buffer.byteLength > LIMITS.IMPORT_MAX_BYTES) {
    throw badRequest(
      `That file is larger than ${LIMITS.IMPORT_MAX_BYTES / 1024 / 1024}MB. Split it and import in batches.`,
    );
  }

  const { rows, missingColumns } = parseFile(buffer, filename);

  if (missingColumns.length > 0) {
    throw badRequest(
      `Your file is missing required column(s): ${missingColumns.join(', ')}. ` +
        `Expected headers: Name, USN, Email, Department, Year, Section, Batch.`,
    );
  }

  if (rows.length === 0) throw badRequest('That file has a header but no student rows.');

  if (rows.length > LIMITS.IMPORT_MAX_ROWS) {
    throw badRequest(
      `That file has ${rows.length} rows, over the ${LIMITS.IMPORT_MAX_ROWS} limit. Split it into batches.`,
    );
  }

  // Departments are referenced by CODE in the file. Resolve them all up front —
  // a per-row lookup would be 1,400 round trips.
  const deptRows = await db
    .select({ id: departments.id, code: departments.code })
    .from(departments);

  const deptByCode = new Map(deptRows.map((d) => [d.code.toUpperCase(), d.id]));

  // ── Pass 1: validate everything, write nothing ─────────────────────────

  const errors: ImportRowError[] = [];
  const unknownDepartments = new Set<string>();
  const valid: Array<{ rowNumber: number; data: ImportRow; departmentId: string }> = [];

  // Duplicate USNs WITHIN the file. Postgres would catch these one at a time, but
  // reporting "row 812 duplicates row 47" is far more useful than a constraint error.
  const seenUsn = new Map<string, number>();
  const seenEmail = new Map<string, number>();

  for (const { rowNumber, raw } of rows) {
    const parsed = importRowSchema.safeParse(raw);

    if (!parsed.success) {
      errors.push({
        row: rowNumber,
        usn: typeof raw.usn === 'string' ? raw.usn : undefined,
        email: typeof raw.email === 'string' ? raw.email : undefined,
        errors: parsed.error.issues.map((i) => `${i.path.join('.') || 'row'}: ${i.message}`),
      });
      continue;
    }

    const data = parsed.data;
    const usn = normalizeUsn(data.usn);
    const email = data.email.toLowerCase();

    const departmentId = deptByCode.get(data.department.toUpperCase());
    if (!departmentId) {
      unknownDepartments.add(data.department.toUpperCase());
      errors.push({
        row: rowNumber,
        usn,
        email,
        errors: [`Unknown department "${data.department}". Create it first, or fix the code.`],
      });
      continue;
    }

    const dupUsnRow = seenUsn.get(usn);
    if (dupUsnRow) {
      errors.push({
        row: rowNumber,
        usn,
        email,
        errors: [`Duplicate USN — already appears on row ${dupUsnRow} of this file.`],
      });
      continue;
    }

    const dupEmailRow = seenEmail.get(email);
    if (dupEmailRow) {
      errors.push({
        row: rowNumber,
        usn,
        email,
        errors: [`Duplicate email — already appears on row ${dupEmailRow} of this file.`],
      });
      continue;
    }

    seenUsn.set(usn, rowNumber);
    seenEmail.set(email, rowNumber);
    valid.push({ rowNumber, data: { ...data, usn, email }, departmentId });
  }

  /**
   * ALL OR NOTHING.
   *
   * If any row is bad, nothing is written. A partial import is the worst outcome
   * available: the admin cannot tell which students exist, re-running the fixed
   * file produces a confusing mix of creates and updates, and in the meantime some
   * students can log in and others cannot. Better to reject the file and let them
   * fix it in Excel, where they were working anyway.
   */
  if (errors.length > 0) {
    return {
      dryRun: options.dryRun,
      totalRows: rows.length,
      created: 0,
      updated: 0,
      skipped: 0,
      failed: errors.length,
      errors: errors.slice(0, MAX_REPORTED_ERRORS),
      unknownDepartments: [...unknownDepartments],
    };
  }

  // ── Pass 2: work out what would change ────────────────────────────────

  const existing = await db
    .select({ id: users.id, usn: users.usn })
    .from(users)
    .where(sql`upper(${users.usn}) IN ${valid.map((v) => v.data.usn)}`);

  const existingByUsn = new Map(
    existing.filter((e) => e.usn).map((e) => [normalizeUsn(e.usn as string), e.id]),
  );

  const toCreate = valid.filter((v) => !existingByUsn.has(v.data.usn));
  const toUpdate = options.updateExisting
    ? valid.filter((v) => existingByUsn.has(v.data.usn))
    : [];
  const skipped = options.updateExisting
    ? 0
    : valid.filter((v) => existingByUsn.has(v.data.usn)).length;

  if (options.dryRun) {
    return {
      dryRun: true,
      totalRows: rows.length,
      created: toCreate.length,
      updated: toUpdate.length,
      skipped,
      failed: 0,
      errors: [],
      unknownDepartments: [],
    };
  }

  // ── Pass 3: write, in ONE transaction ─────────────────────────────────

  await db.transaction(async (tx) => {
    /**
     * Hash the passwords BEFORE the loop, in parallel.
     *
     * bcrypt at cost 12 takes ~250ms. Doing that serially inside the transaction
     * for 1,400 students would hold the transaction open for nearly six minutes
     * and block the connection pool. Hashing concurrently first turns it into a
     * few seconds of CPU outside the write.
     */
    const hashes = await Promise.all(
      toCreate.map((v) =>
        // The default password IS the USN, as specified. `mustChangePassword` is
        // what makes that survivable — the student cannot reach a single endpoint
        // until they replace it.
        hashPassword(v.data.usn),
      ),
    );

    for (let i = 0; i < toCreate.length; i += 200) {
      const slice = toCreate.slice(i, i + 200);
      const sliceHashes = hashes.slice(i, i + 200);

      await tx.insert(users).values(
        slice.map((v, j) => ({
          email: v.data.email,
          passwordHash: sliceHashes[j] as string,
          fullName: v.data.fullName,
          role: 'student' as const,
          usn: v.data.usn,
          departmentId: v.departmentId,
          year: v.data.year,
          section: v.data.section || null,
          batch: v.data.batch || null,
          mustChangePassword: true,
        })),
      );
    }

    /**
     * Update, but NEVER touch the password.
     *
     * Re-importing a corrected spreadsheet must not reset a student's password
     * back to their USN — they may have changed it weeks ago, and silently
     * reverting it would both lock them out and re-expose the account. Password
     * reset is a separate, deliberate, audited admin action.
     */
    for (const v of toUpdate) {
      const id = existingByUsn.get(v.data.usn) as string;

      await tx
        .update(users)
        .set({
          email: v.data.email,
          fullName: v.data.fullName,
          departmentId: v.departmentId,
          year: v.data.year,
          section: v.data.section || null,
          batch: v.data.batch || null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, id));
    }
  });

  logger.info(
    { created: toCreate.length, updated: toUpdate.length, filename },
    'Student import complete',
  );

  return {
    dryRun: false,
    totalRows: rows.length,
    created: toCreate.length,
    updated: toUpdate.length,
    skipped,
    failed: 0,
    errors: [],
    unknownDepartments: [],
  };
}

/** The downloadable template, so an admin never has to guess the column names. */
export function buildTemplate(): Buffer {
  const rows = [
    ['Name', 'USN', 'Email', 'Department', 'Year', 'Section', 'Batch'],
    ['Priya Sharma', '22BTRCS001', 'priya.sharma@jainuniversity.ac.in', 'CSE', 3, 'A', '2022-2026'],
    ['Rahul Verma', '22BTRIS014', 'rahul.verma@jainuniversity.ac.in', 'ISE', 3, 'B', '2022-2026'],
    ['Aisha Khan', '23BTRAI007', 'aisha.khan@jainuniversity.ac.in', 'AIML', 2, 'A', '2023-2027'],
  ];

  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Students');

  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
