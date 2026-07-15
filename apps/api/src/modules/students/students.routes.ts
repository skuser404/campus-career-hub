import {
  LIMITS,
  departmentInputSchema,
  importOptionsSchema,
  studentInputSchema,
  studentListQuerySchema,
  updateDepartmentSchema,
  updateStudentSchema,
  updateUserRoleSchema,
  updateUserStatusSchema,
} from '@cch/shared';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { audit } from '../../lib/audit';
import { badRequest } from '../../lib/errors';
import { asyncHandler, created, noContent, ok } from '../../lib/http';
import { requireAdmin, requireAuth } from '../../middleware/auth';
import { mutationLimiter } from '../../middleware/security';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate';
import * as notifications from '../notifications/notifications.service';
import * as importService from './import.service';
import * as service from './students.service';

const idParams = z.object({ id: z.string().uuid() });

/**
 * In-memory upload.
 *
 * A 5MB cap covers ~40,000 rows of CSV, far above the 5,000-row import limit, and
 * memory storage means no temp file is ever written to disk — nothing to leak,
 * nothing to clean up, nothing left behind if the process dies mid-request.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: LIMITS.IMPORT_MAX_BYTES, files: 1 },
  fileFilter(_req, file, cb) {
    // Accept on EITHER the extension or the mimetype, not both. Browsers report
    // CSV inconsistently across platforms — Windows often sends
    // `application/vnd.ms-excel` for a .csv — so demanding a correct mimetype
    // would reject legitimate files from the very people who need this to work.
    const accepted =
      /\.(csv|xlsx|xls)$/i.test(file.originalname) ||
      [
        'text/csv',
        'application/csv',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ].includes(file.mimetype);

    if (!accepted) {
      // multer's callback takes an Error. Passing our AppError through it means
      // the error middleware still produces a clean 400 rather than a 500.
      return cb(badRequest('Upload a .csv or .xlsx file'));
    }

    cb(null, true);
  },
});

// ─────────────────────────────────────────────────────────────────────────
// Departments — read is available to any signed-in user (the job filters need
// it); write is admin-only.
// ─────────────────────────────────────────────────────────────────────────

export const departmentRoutes: Router = Router();

departmentRoutes.get(
  '/',
  requireAuth,
  asyncHandler(async (_req, res) => ok(res, await service.listDepartments())),
);

export const adminDepartmentRoutes: Router = Router();
adminDepartmentRoutes.use(requireAuth, requireAdmin);

adminDepartmentRoutes.get(
  '/',
  asyncHandler(async (_req, res) => ok(res, await service.listDepartments())),
);

adminDepartmentRoutes.post(
  '/',
  mutationLimiter,
  validateBody(departmentInputSchema),
  asyncHandler(async (req, res) => {
    const row = await service.createDepartment(req.body);
    await audit(req, 'create', 'department', row?.id, { code: row?.code });
    return created(res, row);
  }),
);

adminDepartmentRoutes.patch(
  '/:id',
  mutationLimiter,
  validateParams(idParams),
  validateBody(updateDepartmentSchema),
  asyncHandler(async (req, res) => {
    const row = await service.updateDepartment(req.params.id as string, req.body);
    await audit(req, 'update', 'department', row.id, { fields: Object.keys(req.body) });
    return ok(res, row);
  }),
);

adminDepartmentRoutes.delete(
  '/:id',
  mutationLimiter,
  validateParams(idParams),
  asyncHandler(async (req, res) => {
    await service.deleteDepartment(req.params.id as string);
    await audit(req, 'delete', 'department', req.params.id);
    return noContent(res);
  }),
);

// ─────────────────────────────────────────────────────────────────────────
// Students — admin only, in every respect
// ─────────────────────────────────────────────────────────────────────────

export const adminStudentRoutes: Router = Router();
adminStudentRoutes.use(requireAuth, requireAdmin);

adminStudentRoutes.get(
  '/',
  validateQuery(studentListQuerySchema),
  asyncHandler(async (req, res) => {
    const result = await service.listStudents(req.query as never);
    return ok(res, result.items, result.pagination);
  }),
);

/** The Excel template. Registered before `/:id` or the router reads "template" as a uuid. */
adminStudentRoutes.get(
  '/import/template',
  asyncHandler(async (_req, res) => {
    const buffer = importService.buildTemplate();

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', 'attachment; filename="student-import-template.xlsx"');

    return res.send(buffer);
  }),
);

/**
 * The bulk import.
 *
 * `dryRun=true` parses, validates and reports exactly what WOULD happen without
 * writing a single row. An admin about to touch 1,400 accounts deserves to look
 * before they leap, and the UI runs a dry run automatically before every real one.
 */
adminStudentRoutes.post(
  '/import',
  mutationLimiter,
  upload.single('file'),
  validateQuery(importOptionsSchema),
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest('Attach a .csv or .xlsx file in the "file" field.');

    const options = req.query as unknown as { updateExisting: boolean; dryRun: boolean };

    const result = await importService.importStudents(
      req.file.buffer,
      req.file.originalname,
      options,
    );

    // A dry run changes nothing, so it is not worth an audit entry. A real import
    // creates accounts, and absolutely is.
    if (!result.dryRun) {
      await audit(req, 'create', 'student_import', null, {
        filename: req.file.originalname,
        created: result.created,
        updated: result.updated,
        failed: result.failed,
      });
    }

    return ok(res, result);
  }),
);

adminStudentRoutes.post(
  '/',
  mutationLimiter,
  validateBody(studentInputSchema),
  asyncHandler(async (req, res) => {
    const row = await service.createStudent(req.body);
    await audit(req, 'create', 'student', row.id, { usn: row.usn, email: row.email });
    return created(res, row);
  }),
);

adminStudentRoutes.get(
  '/:id',
  validateParams(idParams),
  asyncHandler(async (req, res) => ok(res, await service.getStudent(req.params.id as string))),
);

adminStudentRoutes.patch(
  '/:id',
  mutationLimiter,
  validateParams(idParams),
  validateBody(updateStudentSchema),
  asyncHandler(async (req, res) => {
    const row = await service.updateStudent(req.params.id as string, req.body);
    await audit(req, 'update', 'student', row.id, { fields: Object.keys(req.body) });
    return ok(res, row);
  }),
);

/** Reset to the USN, re-arm the forced change, and revoke every session. */
adminStudentRoutes.post(
  '/:id/reset-password',
  mutationLimiter,
  validateParams(idParams),
  asyncHandler(async (req, res) => {
    const id = req.params.id as string;
    const result = await service.resetPassword(id);

    await audit(req, 'password_change', 'student', id, { reset: true, by: 'admin' });

    // Tell the student their password was reset. If it was not them who asked,
    // this is how they find out something is wrong.
    await notifications.notifyUser(
      id,
      'account',
      'Your password was reset',
      'An administrator reset your password to your USN. You will be asked to set a new one at your next sign-in.',
    );

    return ok(res, result);
  }),
);

adminStudentRoutes.patch(
  '/:id/status',
  mutationLimiter,
  validateParams(idParams),
  validateBody(updateUserStatusSchema),
  asyncHandler(async (req, res) => {
    const row = await service.setActive(
      req.user!.sub,
      req.params.id as string,
      req.body.isActive,
    );
    await audit(req, 'status_change', 'student', row.id, { isActive: row.isActive });
    return ok(res, row);
  }),
);

adminStudentRoutes.patch(
  '/:id/role',
  mutationLimiter,
  validateParams(idParams),
  validateBody(updateUserRoleSchema),
  asyncHandler(async (req, res) => {
    const row = await service.setRole(req.user!.sub, req.params.id as string, req.body.role);
    await audit(req, 'role_change', 'student', row.id, { role: row.role });
    return ok(res, row);
  }),
);

adminStudentRoutes.delete(
  '/:id',
  mutationLimiter,
  validateParams(idParams),
  asyncHandler(async (req, res) => {
    const id = req.params.id as string;
    await service.deleteStudent(req.user!.sub, id);
    await audit(req, 'delete', 'student', id);
    return noContent(res);
  }),
);
