/**
 * controllerController.ts — RailNexus Backend
 * Controller operations: Review, Approve, Modify (replan), Reject, What-If, History, and SSE.
 */

import { Request, Response, NextFunction } from 'express';
import { MaintenanceRequest } from '../models/MaintenanceRequest';
import {
  approveRequest,
  getControllerHistory,
  modifyRequest,
  rejectRequest,
  runWhatIfSimulation,
} from '../services/decisionService';
import { getAnalysisForRequest, getRequestById } from '../services/maintenanceService';
import { registerSseClient } from '../services/eventService';
import { AuthenticatedUser } from '../middleware/auth';
import { ErrorCode } from '../config/constants';


export async function getAllRequests(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const requests = await MaintenanceRequest.find().sort({ createdAt: -1 });
    res.status(200).json({
      success: true,
      data: requests,
    });
  } catch (err) {
    next(err);
  }
}

export async function getRequestDetails(req: Request, res: Response, next: NextFunction): Promise<void> {
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

export async function getRequestAnalysis(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user as AuthenticatedUser;
    const brainRun = await getAnalysisForRequest(req.params.requestId, user);

    res.status(200).json({
      success: true,
      data: {
        brainRunId: brainRun.brainRunId,
        requestId: brainRun.requestId,
        planningVersion: brainRun.planningVersion,
        planningMode: brainRun.planningMode,
        datasetVersion: brainRun.datasetVersion,
        algorithmVersion: brainRun.algorithmVersion,
        scoringVersion: brainRun.scoringVersion,
        recommendation: brainRun.recommendation,
        recommendations: brainRun.recommendations,
        metrics: brainRun.metrics,
        overallMetrics: brainRun.overallMetrics,
        conflicts: brainRun.conflicts,
        alternatives: brainRun.alternatives,
        planAlternatives: brainRun.planAlternatives,
        bundles: brainRun.bundles,
        scoreBreakdown: brainRun.scoreBreakdown,
        delayTrace: brainRun.delayTrace,
        explanation: brainRun.explanation,
        cascadeStatus: brainRun.cascadeStatus,
        createdAt: brainRun.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function approve(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user as AuthenticatedUser;
    const requestId = req.params.requestId || req.body.requestId;
    const { reason, expectedBrainRunId, expectedPlanningVersion } = req.body;
    const result = await approveRequest(requestId, user, reason, {
      expectedBrainRunId,
      expectedPlanningVersion: expectedPlanningVersion !== undefined ? Number(expectedPlanningVersion) : undefined,
    });

    res.status(200).json({
      success: true,
      message: 'Maintenance request approved successfully.',
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

export async function modify(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user as AuthenticatedUser;
    const requestId = req.params.requestId || req.body.requestId;
    const { start, end, reason, modifiedDurationMinutes, expectedBrainRunId, expectedPlanningVersion } = req.body;
    const result = await modifyRequest(
      requestId,
      user,
      start,
      end,
      reason,
      modifiedDurationMinutes,
      {
        expectedBrainRunId,
        expectedPlanningVersion: expectedPlanningVersion !== undefined ? Number(expectedPlanningVersion) : undefined,
      }
    );

    res.status(200).json({
      success: true,
      message: result.message,
      data: {
        request: result.request,
        brainRun: result.brainRun,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function reject(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user as AuthenticatedUser;
    const requestId = req.params.requestId || req.body.requestId;
    const { reason, expectedBrainRunId, expectedPlanningVersion } = req.body;
    const result = await rejectRequest(requestId, user, reason, {
      expectedBrainRunId,
      expectedPlanningVersion: expectedPlanningVersion !== undefined ? Number(expectedPlanningVersion) : undefined,
    });

    res.status(200).json({
      success: true,
      message: 'Maintenance request rejected.',
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

export async function whatIf(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user as AuthenticatedUser;
    const requestId = req.params.requestId || req.body.requestId;
    const { proposedStart, proposedEnd, overrides } = req.body;
    const result = await runWhatIfSimulation(requestId, proposedStart, proposedEnd, user, overrides);

    res.status(200).json({
      success: true,
      message: 'What-if simulation completed (simulation-only; no database state modified).',
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

export async function getHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rawPage = req.query.page !== undefined ? Number(req.query.page) : 1;
    const rawLimit = req.query.limit !== undefined ? Number(req.query.limit) : 20;
    const MAX_LIMIT = 100;

    if (!Number.isInteger(rawPage) || rawPage < 1 || !Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > MAX_LIMIT) {
      res.status(400).json({
        success: false,
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Invalid pagination parameters. Page must be an integer >= 1, and limit must be an integer between 1 and 100.',
        },
      });
      return;
    }

    const history = await getControllerHistory(rawPage, rawLimit);
    res.status(200).json({
      success: true,
      data: history,
    });
  } catch (err) {
    next(err);
  }
}

export function streamEvents(req: Request, res: Response): void {
  const user = req.user as AuthenticatedUser | undefined;
  const clientId = `CTRL-${user?.id || 'ANON'}-${Date.now()}`;
  registerSseClient(clientId, res, {
    id: user?.id,
    role: user?.role,
    department: user?.department,
  });
}

