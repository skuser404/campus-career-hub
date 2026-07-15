import type { Request } from 'express';
import { db } from '../db/client';
import { auditLogs } from '../db/schema';
import { logger } from './logger';
import { clientIp } from './utils';

export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'bulk_update'
  | 'bulk_delete'
  | 'login'
  | 'logout'
  | 'register'
  | 'password_change'
  | 'role_change'
  | 'status_change'
  | 'settings_change';

/**
 * Record an administrative action.
 *
 * Deliberately never throws. An audit write failing must not roll back the
 * operation the admin actually asked for — we log the failure and move on.
 * The trade-off is explicit: this is an accountability trail, not a financial
 * ledger.
 */
export async function audit(
  req: Request,
  action: AuditAction,
  entityType: string,
  entityId?: string | null,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      actorId: req.user?.sub ?? null,
      action,
      entityType,
      entityId: entityId ?? null,
      metadata: metadata ?? null,
      ip: clientIp(req),
    });
  } catch (err) {
    logger.error({ err, action, entityType, entityId }, 'Failed to write audit log');
  }
}
