/**
 * maintenanceService.ts — RailNexus Backend
 * Orchestrates maintenance request lifecycle, Brain simulation execution, and persistence.
 */

import mongoose from 'mongoose';
import { MaintenanceRequest, IMaintenanceRequest } from '../models/MaintenanceRequest';
import { BrainRun, IBrainRun } from '../models/BrainRun';
import { ControllerDecision } from '../models/ControllerDecision';
import { incrementPlanningVersion } from '../models/PlanningStateCounter';
import { constructPlanningState, toNaiveIsoString } from './planningService';
import { brainClient } from './brainClient';
import { logAudit } from './auditService';
import { emitControllerEvent } from './eventService';
import { AuthenticatedUser } from '../middleware/auth';
import { AuditAction, Department, ErrorCode, RequestPriority, RequestStatus, Role } from '../config/constants';
import { AppError } from '../middleware/errorHandler';
import { BrainAnalyzeRequest } from '../types';

export interface CreateRequestInput {
  maintenanceType: string;
  fromStation: string;
  toStation: string;
  durationMinutes: number;
  earliestStart: string | Date;
  latestEnd: string | Date;
  priority?: RequestPriority;
  description?: string;
  idempotencyKey?: string;
}

export function generateRequestId(): string {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `REQ-${dateStr}-${rand}`;
}

export function generateBrainRunId(): string {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `RUN-${dateStr}-${rand}`;
}

/**
 * Creates a new maintenance request, triggers Brain window simulation, and records full results.
 */
export async function createMaintenanceRequest(
  input: CreateRequestInput,
  user: AuthenticatedUser
): Promise<{ request: IMaintenanceRequest; brainRun?: IBrainRun }> {
  // Derive department directly from authenticated user
  const userDepartment = user.department;
  const isMaintenanceWorker =
    [Department.ENGINEERING, Department.SNT, Department.OHE].includes(userDepartment as Department) ||
    user.role.startsWith('MAINTENANCE_') ||
    user.role === Role.ADMIN;

  if (!isMaintenanceWorker) {
    const err: AppError = new Error('Only maintenance personnel can create maintenance requests.');
    err.statusCode = 403;
    err.code = ErrorCode.FORBIDDEN;
    throw err;
  }

  const requestId = generateRequestId();
  const earliestDate = new Date(input.earliestStart);
  const latestDate = new Date(input.latestEnd);

  // 1. Persist initial request with PENDING status.
  // Concurrent race guard: if two requests with the same idempotencyKey slip past
  // the pre-check simultaneously, MongoDB unique index will reject the second insert
  // with error code 11000. We catch that and replay the existing result.
  let request: IMaintenanceRequest;
  try {
    request = await MaintenanceRequest.create({
      requestId,
      createdBy: new mongoose.Types.ObjectId(user.id),
      department: userDepartment,
      maintenanceType: input.maintenanceType,
      fromStation: input.fromStation.trim().toUpperCase(),
      toStation: input.toStation.trim().toUpperCase(),
      durationMinutes: input.durationMinutes,
      earliestStart: earliestDate,
      latestEnd: latestDate,
      priority: input.priority || RequestPriority.MEDIUM,
      description: input.description,
      status: RequestStatus.PENDING,
      idempotencyKey: input.idempotencyKey,
    });
  } catch (createErr: any) {
    // Concurrent duplicate-key collision on idempotencyKey unique index
    if (createErr.code === 11000 && input.idempotencyKey) {
      const keyPattern = createErr.keyPattern || {};
      const isIdempotencyCollision =
        keyPattern.idempotencyKey ||
        (createErr.message && createErr.message.includes('idempotencyKey'));

      if (isIdempotencyCollision) {
        // Race: another concurrent request already inserted — resolve to existing record.
        const existing = await MaintenanceRequest.findOne({ idempotencyKey: input.idempotencyKey });
        if (existing) {
          // Ownership verification: ensure authenticated user matches the original creator
          const currentUserId = user.id.toString();
          const creatorId = existing.createdBy?.toString();
          if (creatorId && currentUserId && creatorId !== currentUserId) {
            const ownershipErr: any = new Error('Idempotency key belongs to another user and cannot be reused.');
            ownershipErr.statusCode = 403;
            ownershipErr.code = ErrorCode.IDEMPOTENCY_KEY_OWNERSHIP_VIOLATION;
            throw ownershipErr;
          }

          let existingBrainRun = undefined;
          if (existing.currentBrainRunId) {
            const run = await BrainRun.findOne({ brainRunId: existing.currentBrainRunId });
            existingBrainRun = run ?? undefined;
          }
          return { request: existing, brainRun: existingBrainRun };
        }
      }
    }
    throw createErr;
  }

  await logAudit({
    actorId: user.id,
    actorRole: user.role,
    action: AuditAction.REQUEST_CREATED,
    entityId: requestId,
    newState: { requestId, status: RequestStatus.PENDING },
  });

  emitControllerEvent('MAINTENANCE_REQUEST_CREATED', {
    requestId,
    department: userDepartment,
    fromStation: request.fromStation,
    toStation: request.toStation,
    durationMinutes: request.durationMinutes,
    priority: request.priority,
  });

  // 2. Planning Version increment occurs FIRST upon planning-relevant state change
  const newPlanningVersion = await incrementPlanningVersion();
  request.planningVersion = newPlanningVersion;

  // 3. Construct planning state with new planning version
  const { planningState, planningMode } = await constructPlanningState(
    requestId,
    newPlanningVersion
  );

  // 4. Update request status to ANALYZING before calling Brain
  request.status = RequestStatus.ANALYZING;
  await request.save();

  await logAudit({
    actorId: user.id,
    actorRole: user.role,
    action: AuditAction.REQUEST_ANALYSIS_STARTED,
    entityId: requestId,
    planningVersion: newPlanningVersion,
    newState: { status: RequestStatus.ANALYZING },
  });

  // 5. Build Brain payload
  const brainPayload: BrainAnalyzeRequest = {
    request_id: requestId,
    from_station: request.fromStation,
    to_station: request.toStation,
    duration_minutes: request.durationMinutes,
    earliest_start: toNaiveIsoString(request.earliestStart),
    latest_end: toNaiveIsoString(request.latestEnd),
    priority: request.priority,
    planning_state: planningState,
  };

  // -------------------------------------------------------------------------
  // NON-TRANSACTIONAL BRAIN BOUNDARY:
  // Step 1: Persist ANALYZING state and planning version in MongoDB.
  // Step 2: Call Python Brain over HTTP (OUTSIDE any MongoDB transaction).
  // Step 3: Persist immutable BrainRun in MongoDB.
  // Step 4: Conditionally transition MaintenanceRequest from ANALYZING to RECOMMENDED.
  // -------------------------------------------------------------------------

  // 6. Call Python Brain microservice (Strictly outside MongoDB transactions)
  let brainResponse;
  try {
    brainResponse = await brainClient.analyzeMaintenanceWindow(brainPayload);
  } catch (brainError: any) {
    // If Brain fails: Keep request persisted as ANALYZING (retry-safe state).
    // NEVER fabricate fake fallback recommendations. Centralized errorHandler logs error.
    throw brainError;
  }


  // 7. Persist complete BrainRun with matching planning version (Immutable historical record)
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

  // 8. Conditionally transition request from ANALYZING to RECOMMENDED ensuring version consistency
  const updatedRequest = await MaintenanceRequest.findOneAndUpdate(
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

  if (!updatedRequest) {
    const err: AppError = new Error(
      'Failed to finalize maintenance request: planning state or version was concurrently superseded.'
    );
    err.statusCode = 409;
    err.code = ErrorCode.STALE_PLAN;
    throw err;
  }

  await logAudit({
    actorId: user.id,
    actorRole: user.role,
    action: AuditAction.REQUEST_RECOMMENDED,
    entityId: requestId,
    brainRunId,
    planningVersion: newPlanningVersion,
    newState: { status: RequestStatus.RECOMMENDED, currentBrainRunId: brainRunId },
  });

  // 9. Emit SSE only after database persistence is fully committed
  emitControllerEvent('REQUEST_RECOMMENDED', {
    requestId,
    status: RequestStatus.RECOMMENDED,
    department: updatedRequest.department,
    brainRunId,
    planningVersion: newPlanningVersion,
    recommendation: brainResponse.recommendation,
  });

  return { request: updatedRequest, brainRun };
}

/**
 * Retrieves requests filtered by authorization role.
 */
export async function getMaintenanceRequestsForUser(
  user: AuthenticatedUser
): Promise<IMaintenanceRequest[]> {
  const isControllerOrAdmin =
    user.role === Role.CONTROLLER || user.role === Role.ADMIN;

  if (isControllerOrAdmin) {
    return await MaintenanceRequest.find().sort({ createdAt: -1 });
  }

  const userDept = user.department ? user.department.trim() : '';
  const escapedDept = userDept.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const query: any = {
    $or: [
      { department: { $regex: new RegExp(`^${escapedDept}$`, 'i') } },
      { createdBy: user.id },
    ],
  };

  return await MaintenanceRequest.find(query).sort({ createdAt: -1 });
}

/**
 * Retrieves request by requestId with strict department isolation.
 */
export async function getRequestById(
  requestId: string,
  user: AuthenticatedUser
): Promise<{
  request: IMaintenanceRequest;
  brainRun?: IBrainRun | null;
  activeAnalysis?: IBrainRun | null;
  decision?: any | null;
}> {
  const request = await MaintenanceRequest.findOne({ requestId });
  if (!request) {
    const err: AppError = new Error(`Maintenance request '${requestId}' not found.`);
    err.statusCode = 404;
    err.code = ErrorCode.REQUEST_NOT_FOUND;
    throw err;
  }

  const isControllerOrAdmin =
    user.role === Role.CONTROLLER || user.role === Role.ADMIN;

  const userDept = user.department ? user.department.trim().toUpperCase() : '';
  const reqDept = request.department ? request.department.trim().toUpperCase() : '';
  const deptMatches = userDept.length > 0 && reqDept === userDept;
  const isCreator = request.createdBy && request.createdBy.toString() === user.id;

  if (!isControllerOrAdmin && !deptMatches && !isCreator) {
    const err: AppError = new Error('Access denied. You cannot view requests from other departments.');
    err.statusCode = 403;
    err.code = ErrorCode.FORBIDDEN;
    throw err;
  }

  let brainRun = null;
  if (request.currentBrainRunId) {
    brainRun = await BrainRun.findOne({ brainRunId: request.currentBrainRunId });
  }

  // Fetch the latest controller decision for this request if one exists
  const decision = await ControllerDecision.findOne({ requestId }).sort({ createdAt: -1 });

  return { request, brainRun, activeAnalysis: brainRun, decision };
}

/**
 * Retrieves latest BrainRun analysis details for a request.
 */
export async function getAnalysisForRequest(
  requestId: string,
  user: AuthenticatedUser
): Promise<IBrainRun> {
  const { request } = await getRequestById(requestId, user);

  if (!request.currentBrainRunId) {
    const err: AppError = new Error(`No Brain analysis run found for request '${requestId}'.`);
    err.statusCode = 404;
    err.code = ErrorCode.REQUEST_NOT_FOUND;
    throw err;
  }

  const brainRun = await BrainRun.findOne({ brainRunId: request.currentBrainRunId });
  if (!brainRun) {
    const err: AppError = new Error(`BrainRun '${request.currentBrainRunId}' not found.`);
    err.statusCode = 404;
    err.code = ErrorCode.REQUEST_NOT_FOUND;
    throw err;
  }

  return brainRun;
}
