/**
 * auditService.ts — RailNexus Backend
 * Append-only audit logger for tracking operational actions and state transitions.
 */

import mongoose from 'mongoose';
import { AuditLog } from '../models/AuditLog';
import { AuditAction } from '../config/constants';

export interface AuditParams {
  actorId: string | mongoose.Types.ObjectId;
  actorRole: string;
  action: AuditAction;
  entityId: string;
  entityType?: string;
  previousState?: Record<string, any>;
  newState?: Record<string, any>;
  brainRunId?: string;
  planningVersion?: number;
  metadata?: Record<string, any>;
}

export async function logAudit(params: AuditParams): Promise<void> {
  try {
    const actorObjectId =
      typeof params.actorId === 'string'
        ? new mongoose.Types.ObjectId(params.actorId)
        : params.actorId;

    await AuditLog.create({
      actorId: actorObjectId,
      actorRole: params.actorRole,
      action: params.action,
      entityType: params.entityType || 'MAINTENANCE_REQUEST',
      entityId: params.entityId,
      previousState: params.previousState,
      newState: params.newState,
      brainRunId: params.brainRunId,
      planningVersion: params.planningVersion,
      metadata: params.metadata,
    });
  } catch (err: any) {
    console.error(`[AUDIT_LOG_ERROR] Failed to record audit log for action ${params.action}:`, err.message);
  }
}
