/**
 * decisionService.ts — RailNexus Backend
 * Controller decision workflows: Approve, Modify (Brain replan), Reject, What-If, and History.
 */

import mongoose from 'mongoose';
import { MaintenanceRequest, IMaintenanceRequest } from '../models/MaintenanceRequest';
import { ControllerDecision, IControllerDecision } from '../models/ControllerDecision';
import { BrainRun, IBrainRun } from '../models/BrainRun';
import {
  getCurrentPlanningVersion,
  incrementPlanningVersion,
} from '../models/PlanningStateCounter';
import { constructPlanningState, toNaiveIsoString } from './planningService';
import { brainClient } from './brainClient';
import { logAudit } from './auditService';
import { emitControllerEvent } from './eventService';
import { generateBrainRunId } from './maintenanceService';
import { AuthenticatedUser } from '../middleware/auth';
import {
  AuditAction,
  ControllerAction,
  ErrorCode,
  RequestPriority,
  RequestStatus,
} from '../config/constants';
import { AppError } from '../middleware/errorHandler';
import { BrainAnalyzeRequest } from '../types';

export function generateDecisionId(): string {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `DEC-${dateStr}-${rand}`;
}

/**
 * Controller Approves a RECOMMENDED maintenance request.
 * Concurrency-safe: uses atomic conditional update.
 */
export async function approveRequest(
  requestId: string,
  controllerUser: AuthenticatedUser,
  reason: string,
  options?: {
    expectedBrainRunId?: string;
    expectedPlanningVersion?: number;
  }
): Promise<{ decision: IControllerDecision; request: IMaintenanceRequest }> {
  const existing = await MaintenanceRequest.findOne({ requestId });
  if (!existing) {
    const err: AppError = new Error(`Maintenance request '${requestId}' not found.`);
    err.statusCode = 404;
    err.code = ErrorCode.REQUEST_NOT_FOUND;
    throw err;
  }

  // Stale check if explicit client expectations provided
  if (options?.expectedBrainRunId && existing.currentBrainRunId !== options.expectedBrainRunId) {
    const err: AppError = new Error(
      `Stale recommendation: current active analysis is '${existing.currentBrainRunId}', but approval was requested for '${options.expectedBrainRunId}'.`
    );
    err.statusCode = 409;
    err.code = ErrorCode.STALE_PLAN;
    throw err;
  }

  if (options?.expectedPlanningVersion !== undefined && existing.planningVersion !== options.expectedPlanningVersion) {
    const err: AppError = new Error(
      `Stale plan version: current active version is ${existing.planningVersion}, but approval was requested for version ${options.expectedPlanningVersion}.`
    );
    err.statusCode = 409;
    err.code = ErrorCode.STALE_PLAN;
    throw err;
  }

  if (existing.status !== RequestStatus.RECOMMENDED) {
    const err: AppError = new Error(
      `Cannot approve request in status '${existing.status}'. The request has already been decided or changed.`
    );
    err.statusCode = 409;
    err.code = ErrorCode.REQUEST_ALREADY_DECIDED;
    throw err;
  }

  const latestBrainRun = existing.currentBrainRunId
    ? await BrainRun.findOne({ brainRunId: existing.currentBrainRunId })
    : null;

  let selectedWindow;
  if (latestBrainRun?.recommendation?.start && latestBrainRun?.recommendation?.end) {
    selectedWindow = {
      start: new Date(latestBrainRun.recommendation.start),
      end: new Date(latestBrainRun.recommendation.end),
    };
  }

  const previousPlanVersion = existing.planningVersion;
  const newPlanningVersion = await incrementPlanningVersion();

  // ATOMIC CONDITIONAL UPDATE:
  // Must match status = RECOMMENDED, matching currentBrainRunId, and matching planningVersion
  const atomicFilter: any = {
    requestId,
    status: RequestStatus.RECOMMENDED,
    currentBrainRunId: existing.currentBrainRunId,
    planningVersion: previousPlanVersion,
  };

  const updatedRequest = await MaintenanceRequest.findOneAndUpdate(
    atomicFilter,
    {
      $set: {
        status: RequestStatus.APPROVED,
        planningVersion: newPlanningVersion,
      },
    },
    { returnDocument: 'after' }
  );

  if (!updatedRequest) {
    // Concurrency race: another controller already approved/modified/rejected this request
    const err: AppError = new Error('The request has already been decided or changed by another controller.');
    err.statusCode = 409;
    err.code = ErrorCode.REQUEST_ALREADY_DECIDED;
    throw err;
  }

  // Exactly one decision record persisted for the winning update
  const decisionId = generateDecisionId();
  const decision = await ControllerDecision.create({
    decisionId,
    requestId,
    brainRunId: updatedRequest.currentBrainRunId || 'N/A',
    controllerId: new mongoose.Types.ObjectId(controllerUser.id),
    action: ControllerAction.APPROVE,
    reason,
    selectedWindow,
    previousPlanVersion,
    newPlanVersion: newPlanningVersion,
  });

  await logAudit({
    actorId: controllerUser.id,
    actorRole: controllerUser.role,
    action: AuditAction.REQUEST_APPROVED,
    entityId: requestId,
    entityType: 'MAINTENANCE_REQUEST',
    previousState: { status: RequestStatus.RECOMMENDED },
    newState: { status: RequestStatus.APPROVED, decisionId },
    brainRunId: updatedRequest.currentBrainRunId,
    planningVersion: newPlanningVersion,
    metadata: { reason, selectedWindow },
  });

  // Emit SSE only after database persistence succeeds
  emitControllerEvent('REQUEST_APPROVED', {
    requestId,
    decisionId,
    status: RequestStatus.APPROVED,
    department: updatedRequest.department,
    selectedWindow,
    planningVersion: newPlanningVersion,
    reason,
  });

  return { decision, request: updatedRequest };
}

/**
 * Controller Modifies proposed window boundaries.
 * Concurrency-safe: uses atomic conditional update.
 * Non-transactional boundary: calls Python Brain outside transaction.
 */
export async function modifyRequest(
  requestId: string,
  controllerUser: AuthenticatedUser,
  proposedStart?: string | Date,
  proposedEnd?: string | Date,
  reason: string = '',
  modifiedDurationMinutes?: number,
  options?: {
    expectedBrainRunId?: string;
    expectedPlanningVersion?: number;
  }
): Promise<{ request: IMaintenanceRequest; brainRun: IBrainRun; message: string }> {
  const existing = await MaintenanceRequest.findOne({ requestId });
  if (!existing) {
    const err: AppError = new Error(`Maintenance request '${requestId}' not found.`);
    err.statusCode = 404;
    err.code = ErrorCode.REQUEST_NOT_FOUND;
    throw err;
  }

  // Stale check if explicit expectations provided
  if (options?.expectedBrainRunId && existing.currentBrainRunId !== options.expectedBrainRunId) {
    const err: AppError = new Error(
      `Stale recommendation: current active analysis is '${existing.currentBrainRunId}', but modification was requested for '${options.expectedBrainRunId}'.`
    );
    err.statusCode = 409;
    err.code = ErrorCode.STALE_PLAN;
    throw err;
  }

  if (options?.expectedPlanningVersion !== undefined && existing.planningVersion !== options.expectedPlanningVersion) {
    const err: AppError = new Error(
      `Stale plan version: current active version is ${existing.planningVersion}, but modification was requested for version ${options.expectedPlanningVersion}.`
    );
    err.statusCode = 409;
    err.code = ErrorCode.STALE_PLAN;
    throw err;
  }

  if (existing.status !== RequestStatus.RECOMMENDED) {
    const err: AppError = new Error(
      `Cannot modify request in status '${existing.status}'. Must be in '${RequestStatus.RECOMMENDED}'.`
    );
    err.statusCode = 409;
    err.code = ErrorCode.REQUEST_ALREADY_DECIDED;
    throw err;
  }

  const previousPlanVersion = existing.planningVersion;
  const newPlanningVersion = await incrementPlanningVersion();

  // ATOMIC CONDITIONAL UPDATE:
  // Conditionally move RECOMMENDED -> ANALYZING with newPlanningVersion
  const atomicFilter: any = {
    requestId,
    status: RequestStatus.RECOMMENDED,
    currentBrainRunId: existing.currentBrainRunId,
    planningVersion: previousPlanVersion,
  };

  const updateFields: any = {
    status: RequestStatus.ANALYZING,
    planningVersion: newPlanningVersion,
  };
  if (proposedStart && proposedEnd) {
    updateFields.earliestStart = new Date(proposedStart);
    updateFields.latestEnd = new Date(proposedEnd);
  }
  if (modifiedDurationMinutes) {
    updateFields.durationMinutes = modifiedDurationMinutes;
  }

  const updatedRequest = await MaintenanceRequest.findOneAndUpdate(
    atomicFilter,
    { $set: updateFields },
    { returnDocument: 'after' }
  );

  if (!updatedRequest) {
    // Concurrency race: request was concurrently approved, modified, or rejected
    const err: AppError = new Error('The request has already been decided or modified by another controller.');
    err.statusCode = 409;
    err.code = ErrorCode.REQUEST_ALREADY_DECIDED;
    throw err;
  }

  // -------------------------------------------------------------------------
  // NON-TRANSACTIONAL BRAIN BOUNDARY:
  // State transition to ANALYZING is already committed.
  // Brain replan call is executed OUTSIDE any MongoDB transaction.
  // -------------------------------------------------------------------------

  const { planningState, planningMode } = await constructPlanningState(
    requestId,
    newPlanningVersion
  );

  const brainPayload: BrainAnalyzeRequest = {
    request_id: requestId,
    from_station: updatedRequest.fromStation,
    to_station: updatedRequest.toStation,
    duration_minutes: updatedRequest.durationMinutes,
    earliest_start: toNaiveIsoString(updatedRequest.earliestStart),
    latest_end: toNaiveIsoString(updatedRequest.latestEnd),
    priority: updatedRequest.priority,
    planning_state: planningState,
  };

  const brainResponse = await brainClient.analyzeMaintenanceWindow(brainPayload);

  // Persist new immutable BrainRun
  const brainRunId = brainResponse.brain_run_id || generateBrainRunId();
  const brainRun = await BrainRun.create({
    brainRunId,
    requestId,
    planningVersion: newPlanningVersion,
    planningMode,
    datasetVersion: brainResponse.metadata?.version,
    algorithmVersion: brainResponse.metadata?.algorithm_version,
    scoringVersion: brainResponse.metadata?.scoring_version,
    recommendation: brainResponse.recommendation || {},
    recommendations: brainResponse.recommendations || [],
    metrics: brainResponse.metrics || {},
    overallMetrics: brainResponse.overall_metrics,
    conflicts: brainResponse.conflicts || [],
    alternatives: brainResponse.alternatives || [],
    planAlternatives: brainResponse.plan_alternatives || [],
    bundles: brainResponse.bundles || [],
    scoreBreakdown: brainResponse.score_breakdown || [],
    delayTrace: brainResponse.delay_trace || [],
    explanation: brainResponse.explanation,
    cascadeStatus: brainResponse.cascade_status,
  });

  // Conditionally transition from ANALYZING to RECOMMENDED ensuring version is still newPlanningVersion
  const finalRequest = await MaintenanceRequest.findOneAndUpdate(
    {
      requestId,
      status: RequestStatus.ANALYZING,
      planningVersion: newPlanningVersion,
    },
    {
      $set: {
        status: RequestStatus.RECOMMENDED,
        currentBrainRunId: brainRunId,
      },
    },
    { returnDocument: 'after' }
  );

  if (!finalRequest) {
    const err: AppError = new Error(
      'Failed to finalize replan: request state or planning version was concurrently superseded.'
    );
    err.statusCode = 409;
    err.code = ErrorCode.STALE_PLAN;
    throw err;
  }

  const decisionId = generateDecisionId();
  await ControllerDecision.create({
    decisionId,
    requestId,
    brainRunId,
    controllerId: new mongoose.Types.ObjectId(controllerUser.id),
    action: ControllerAction.MODIFY,
    reason,
    previousPlanVersion,
    newPlanVersion: newPlanningVersion,
  });

  await logAudit({
    actorId: controllerUser.id,
    actorRole: controllerUser.role,
    action: AuditAction.REQUEST_MODIFIED,
    entityId: requestId,
    previousState: { status: RequestStatus.RECOMMENDED },
    newState: { status: RequestStatus.RECOMMENDED, brainRunId },
    planningVersion: newPlanningVersion,
    brainRunId,
    metadata: { reason },
  });

  emitControllerEvent('PLAN_REANALYZED', {
    requestId,
    brainRunId,
    status: finalRequest.status,
    department: finalRequest.department,
    planningVersion: newPlanningVersion,
    recommendation: brainResponse.recommendation,
    metrics: brainResponse.metrics,
  });

  return {
    request: finalRequest,
    brainRun,
    message: 'Request modified and re-planned successfully through Brain cascade simulation.',
  };
}

/**
 * Controller Rejects a request with mandatory justification reason.
 * Concurrency-safe: uses atomic conditional update.
 * Strictly limited to valid lifecycle: RECOMMENDED -> REJECTED.
 */
export async function rejectRequest(
  requestId: string,
  controllerUser: AuthenticatedUser,
  reason: string,
  options?: {
    expectedBrainRunId?: string;
    expectedPlanningVersion?: number;
  }
): Promise<{ decision: IControllerDecision; request: IMaintenanceRequest }> {
  if (!reason || !reason.trim()) {
    const err: AppError = new Error('Rejection reason is mandatory.');
    err.statusCode = 400;
    err.code = ErrorCode.VALIDATION_ERROR;
    throw err;
  }

  const existing = await MaintenanceRequest.findOne({ requestId });
  if (!existing) {
    const err: AppError = new Error(`Maintenance request '${requestId}' not found.`);
    err.statusCode = 404;
    err.code = ErrorCode.REQUEST_NOT_FOUND;
    throw err;
  }

  // Stale checks if client expectations provided
  if (options?.expectedBrainRunId && existing.currentBrainRunId !== options.expectedBrainRunId) {
    const err: AppError = new Error(
      `Stale recommendation: current active analysis is '${existing.currentBrainRunId}', but rejection was requested for '${options.expectedBrainRunId}'.`
    );
    err.statusCode = 409;
    err.code = ErrorCode.STALE_PLAN;
    throw err;
  }

  if (options?.expectedPlanningVersion !== undefined && existing.planningVersion !== options.expectedPlanningVersion) {
    const err: AppError = new Error(
      `Stale plan version: current active version is ${existing.planningVersion}, but rejection was requested for version ${options.expectedPlanningVersion}.`
    );
    err.statusCode = 409;
    err.code = ErrorCode.STALE_PLAN;
    throw err;
  }

  if (existing.status !== RequestStatus.RECOMMENDED) {
    const err: AppError = new Error(
      `Cannot reject request in status '${existing.status}'. Must be in '${RequestStatus.RECOMMENDED}'.`
    );
    err.statusCode = 409;
    err.code = ErrorCode.REQUEST_ALREADY_DECIDED;
    throw err;
  }

  const previousPlanVersion = existing.planningVersion;
  const newPlanningVersion = await incrementPlanningVersion();

  // ATOMIC CONDITIONAL UPDATE:
  const updatedRequest = await MaintenanceRequest.findOneAndUpdate(
    {
      requestId,
      status: RequestStatus.RECOMMENDED,
      currentBrainRunId: existing.currentBrainRunId,
      planningVersion: previousPlanVersion,
    },
    {
      $set: {
        status: RequestStatus.REJECTED,
        planningVersion: newPlanningVersion,
      },
    },
    { returnDocument: 'after' }
  );

  if (!updatedRequest) {
    const err: AppError = new Error('The request has already been decided or changed by another controller.');
    err.statusCode = 409;
    err.code = ErrorCode.REQUEST_ALREADY_DECIDED;
    throw err;
  }

  const decisionId = generateDecisionId();
  const decision = await ControllerDecision.create({
    decisionId,
    requestId,
    brainRunId: updatedRequest.currentBrainRunId || 'N/A',
    controllerId: new mongoose.Types.ObjectId(controllerUser.id),
    action: ControllerAction.REJECT,
    reason,
    previousPlanVersion,
    newPlanVersion: newPlanningVersion,
  });

  await logAudit({
    actorId: controllerUser.id,
    actorRole: controllerUser.role,
    action: AuditAction.REQUEST_REJECTED,
    entityId: requestId,
    previousState: { status: RequestStatus.RECOMMENDED },
    newState: { status: RequestStatus.REJECTED, decisionId },
    planningVersion: newPlanningVersion,
    metadata: { reason },
  });

  emitControllerEvent('REQUEST_REJECTED', {
    requestId,
    decisionId,
    status: RequestStatus.REJECTED,
    department: updatedRequest.department,
    planningVersion: newPlanningVersion,
    reason,
  });

  return { decision, request: updatedRequest };
}

/**
 * What-If Simulation: calls Brain without altering official database state or approved plans.
 */
export async function runWhatIfSimulation(
  requestId: string,
  proposedStart: string | Date | undefined,
  proposedEnd: string | Date | undefined,
  _controllerUser: AuthenticatedUser,
  overrides?: {
    durationMinutes?: number;
    priority?: RequestPriority;
  }
): Promise<any> {
  const request = await MaintenanceRequest.findOne({ requestId });
  if (!request) {
    const err: AppError = new Error(`Maintenance request '${requestId}' not found.`);
    err.statusCode = 404;
    err.code = ErrorCode.REQUEST_NOT_FOUND;
    throw err;
  }

  const currentVersion = await getCurrentPlanningVersion();
  const { planningState } = await constructPlanningState(requestId, currentVersion);

  const durationMinutes = overrides?.durationMinutes ?? request.durationMinutes;
  const earliestStart = proposedStart ? new Date(proposedStart) : request.earliestStart;
  const latestEnd = proposedEnd ? new Date(proposedEnd) : request.latestEnd;
  const priority = overrides?.priority ?? request.priority;

  const whatIfPayload: BrainAnalyzeRequest = {
    request_id: `WHATIF-${requestId}`,
    from_station: request.fromStation,
    to_station: request.toStation,
    duration_minutes: durationMinutes,
    earliest_start: toNaiveIsoString(earliestStart),
    latest_end: toNaiveIsoString(latestEnd),
    priority,
    planning_state: planningState,
  };

  // Direct call to Brain; output returned immediately without database persistence
  const simulationResult = await brainClient.analyzeMaintenanceWindow(whatIfPayload);

  return {
    isSimulation: true,
    requestId,
    simulationResult,
  };
}

export interface PaginatedHistoryResult {
  decisions: IControllerDecision[];
  recentRuns: IBrainRun[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

/**
 * Controller History: returns chronological audit of decisions, requests, and plan versions with pagination.
 */
export async function getControllerHistory(
  page: number = 1,
  limit: number = 20
): Promise<PaginatedHistoryResult> {
  const skip = (page - 1) * limit;

  const [total, decisions, recentRuns] = await Promise.all([
    ControllerDecision.countDocuments(),
    ControllerDecision.find()
      .populate('controllerId', 'name email role department')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    BrainRun.find()
      .sort({ createdAt: -1 })
      .limit(50),
  ]);

  const totalPages = Math.ceil(total / limit) || 1;

  return {
    decisions,
    recentRuns,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
}

