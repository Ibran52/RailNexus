/**
 * auditController.ts — RailNexus Backend
 * Controller for retrieving operational audit logs.
 */

import { Request, Response, NextFunction } from 'express';
import { AuditLog } from '../models/AuditLog';

export async function getAuditLogs(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { entityId, action, limit = '50', skip = '0' } = req.query;

    const query: Record<string, any> = {};
    if (entityId && typeof entityId === 'string') {
      query.entityId = entityId.trim();
    }
    if (action && typeof action === 'string') {
      query.action = action.trim();
    }

    const logs = await AuditLog.find(query)
      .populate('actorId', 'name email role department')
      .sort({ createdAt: -1 })
      .skip(parseInt(skip as string, 10) || 0)
      .limit(Math.min(parseInt(limit as string, 10) || 50, 100));

    const total = await AuditLog.countDocuments(query);

    res.status(200).json({
      success: true,
      data: {
        total,
        logs,
      },
    });
  } catch (err) {
    next(err);
  }
}
