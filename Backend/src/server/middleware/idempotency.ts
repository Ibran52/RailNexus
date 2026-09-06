/**
 * idempotency.ts — RailNexus Backend
 * Prevents accidental duplicate maintenance request creation on client retry.
 *
 * PRODUCTION RACE-CONDITION SAFETY:
 * - Pre-check: Query for existing record with the same idempotency key.
 * - If found:
 *     - If createdBy != authenticated user: 403 IDEMPOTENCY_KEY_OWNERSHIP_VIOLATION
 *     - If createdBy == authenticated user: 200 with existing request + BrainRun (idempotent replay)
 * - If NOT found: Pass through to the controller, which will persist with the key.
 * - Concurrent race after pre-check: Caught by MongoDB 11000 unique index in maintenanceService.
 *
 * RETENTION POLICY (P2-1):
 * Idempotency key retention is currently unbounded in MongoDB (stored indefinitely in MaintenanceRequest).
 * In high-volume production deployments, a TTL index on a dedicated collection (24h-7d window)
 * should be implemented.
 */

import { Request, Response, NextFunction } from 'express';
import { MaintenanceRequest } from '../models/MaintenanceRequest';
import { BrainRun } from '../models/BrainRun';
import { ErrorCode } from '../config/constants';

export async function checkIdempotency(req: Request, res: Response, next: NextFunction): Promise<void> {
  const rawKey = req.headers['idempotency-key'];
  if (!rawKey || typeof rawKey !== 'string' || rawKey.trim() === '') {
    return next();
  }

  const key = rawKey.trim();

  try {
    // 1. Find by idempotencyKey
    const existing = await MaintenanceRequest.findOne({ idempotencyKey: key });
    if (!existing) {
      return next();
    }

    // 2. Ownership verification: ensure authenticated user matches the original creator
    const currentUserId = (req.user as any)?.id?.toString();
    const creatorId = existing.createdBy?.toString();

    if (creatorId && currentUserId && creatorId !== currentUserId) {
      res.status(403).json({
        success: false,
        error: {
          code: ErrorCode.IDEMPOTENCY_KEY_OWNERSHIP_VIOLATION,
          message: 'Idempotency key belongs to another user and cannot be reused.',
        },
      });
      return;
    }

    // 3. Fetch associated BrainRun if one has been recorded
    let brainRun = null;
    if (existing.currentBrainRunId) {
      brainRun = await BrainRun.findOne({ brainRunId: existing.currentBrainRunId });
    }

    // 4. Idempotent replay — return the persisted result without re-processing
    res.status(200).json({
      success: true,
      message: 'Maintenance request already processed (idempotent duplicate — replayed existing result).',
      data: {
        request: existing,
        brainRun: brainRun ?? undefined,
        isDuplicate: true,
      },
    });
    return;
  } catch (err) {
    next(err);
  }
}

