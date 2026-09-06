/**
 * maintenanceController.ts — RailNexus Backend
 * Controller for maintenance personnel request submission and tracking.
 */

import { Request, Response, NextFunction } from 'express';
import {
  createMaintenanceRequest,
  getAnalysisForRequest,
  getMaintenanceRequestsForUser,
  getRequestById,
} from '../services/maintenanceService';
import { registerSseClient } from '../services/eventService';
import { AuthenticatedUser } from '../middleware/auth';

export async function createRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user as AuthenticatedUser;
    const idempotencyKey = req.headers['idempotency-key'] as string | undefined;

    const result = await createMaintenanceRequest(
      {
        ...req.body,
        idempotencyKey,
      },
      user
    );

    res.status(201).json({
      success: true,
      message: 'Maintenance request created and analyzed by Brain.',
      data: {
        request: result.request,
        brainRun: result.brainRun,
        recommendation: result.brainRun?.recommendation,
        brainRunId: result.brainRun?.brainRunId,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function getRequests(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user as AuthenticatedUser;
    const requests = await getMaintenanceRequestsForUser(user);

    res.status(200).json({
      success: true,
      data: {
        requests,
        count: requests.length,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function getRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user as AuthenticatedUser;
    const result = await getRequestById(req.params.requestId, user);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

export async function getAnalysis(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user as AuthenticatedUser;
    const brainRun = await getAnalysisForRequest(req.params.requestId, user);

    res.status(200).json({
      success: true,
      data: brainRun,
    });
  } catch (err) {
    next(err);
  }
}

export function streamEvents(req: Request, res: Response): void {
  const user = req.user as AuthenticatedUser;
  const clientId = `WORKER-${user?.id || 'ANON'}-${Date.now()}`;
  registerSseClient(clientId, res, {
    id: user?.id,
    role: user?.role,
    department: user?.department,
  });
}

