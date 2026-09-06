/**
 * planningService.ts — RailNexus Backend
 * Manages global railway maintenance planning state, versioning, and fixed exclusions.
 */

import { MaintenanceRequest } from '../models/MaintenanceRequest';
import { ControllerDecision } from '../models/ControllerDecision';
import { ControllerAction, PlanningMode, RequestStatus } from '../config/constants';
import {
  BrainFixedPlanItem,
  BrainPendingRequestItem,
  BrainPlanningState,
} from '../types';
import { BrainPlanningRequestStatus } from '../config/constants';

/**
 * Formats a Date object into an ISO 8601 string without timezone offset or trailing 'Z'.
 * This ensures Python/Pydantic parses it as a timezone-naive datetime, matching
 * the tz-naive timestamps in the pandas railway schedule dataset.
 */
export function toNaiveIsoString(date: Date | string): string {
  const d = new Date(date);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

function toIsoDate(date: Date | string): string {
  return new Date(date).toISOString();
}

/**
 * Canonical Brain Planning Status Mapper
 * Maps internal MongoDB / Domain lifecycle statuses to the Python Brain PlanningState
 * vocabulary without modifying or mutating persistent database records.
 *
 * Mapping Rules:
 *   ANALYZING   → PENDING (in-flight request behaves as flexible pending in joint planning)
 *   MODIFIED    → PENDING (modified request requires replan; behaves as flexible pending)
 *   PENDING     → PENDING
 *   RECOMMENDED → RECOMMENDED
 *   APPROVED    → APPROVED (used when asserting fixed plan status)
 *   SCHEDULED   → SCHEDULED (used when asserting fixed plan status)
 *   COMPLETED   → COMPLETED
 *   REJECTED    → REJECTED
 *   CANCELLED   → CANCELLED
 */
export function toBrainPlanningRequestStatus(
  status?: RequestStatus | string
): BrainPlanningRequestStatus {
  switch (status) {
    case RequestStatus.ANALYZING:
    case RequestStatus.MODIFIED:
      return BrainPlanningRequestStatus.PENDING;

    case RequestStatus.PENDING:
      return BrainPlanningRequestStatus.PENDING;

    case RequestStatus.RECOMMENDED:
      return BrainPlanningRequestStatus.RECOMMENDED;

    case RequestStatus.APPROVED:
      return BrainPlanningRequestStatus.APPROVED;

    case RequestStatus.SCHEDULED:
      return BrainPlanningRequestStatus.SCHEDULED;

    case RequestStatus.COMPLETED:
      return BrainPlanningRequestStatus.COMPLETED;

    case RequestStatus.REJECTED:
      return BrainPlanningRequestStatus.REJECTED;

    case RequestStatus.CANCELLED:
      return BrainPlanningRequestStatus.CANCELLED;

    default:
      return BrainPlanningRequestStatus.PENDING;
  }
}

/**
 * Normalizes an entire BrainPlanningState object before outbound dispatch to Python Brain.
 * Guarantees that neither ANALYZING nor MODIFIED ever enters planning_state.pending_requests.
 */
export function normalizePlanningStateForBrain(
  planningState: BrainPlanningState
): BrainPlanningState {
  return {
    ...planningState,
    pending_requests: (planningState.pending_requests || []).map((item) => ({
      ...item,
      status: toBrainPlanningRequestStatus(item.status),
    })),
    fixed_plans: (planningState.fixed_plans || []).map((item) => ({
      ...item,
      status: toBrainPlanningRequestStatus(item.status),
    })),
  };
}

/**
 * Constructs the current backend-owned PlanningState for transmission to Python Brain.
 *
 * Excludes the current target request from pending_requests to prevent self-conflict.
 * Flexible pending requests: [PENDING, ANALYZING, MODIFIED, RECOMMENDED].
 * Fixed exclusions: [APPROVED, SCHEDULED].
 * Terminal non-active requests: [REJECTED, COMPLETED, CANCELLED] (excluded).
 */
export async function constructPlanningState(
  currentRequestId: string,
  planningVersion: number
): Promise<{ planningState: BrainPlanningState; planningMode: PlanningMode }> {
  // 1. Fetch active pending requests other than the current target request
  const pendingDocs = await MaintenanceRequest.find({
    requestId: { $ne: currentRequestId },
    status: {
      $in: [
        RequestStatus.PENDING,
        RequestStatus.ANALYZING,
        RequestStatus.MODIFIED,
        RequestStatus.RECOMMENDED,
      ],
    },
  }).lean();

  const pending_requests: BrainPendingRequestItem[] = pendingDocs.map((doc) => ({
    request_id: doc.requestId,
    from_station: doc.fromStation,
    to_station: doc.toStation,
    duration_minutes: doc.durationMinutes,
    earliest_start: toNaiveIsoString(doc.earliestStart),
    latest_end: toNaiveIsoString(doc.latestEnd),
    priority: doc.priority,
    status: toBrainPlanningRequestStatus(doc.status),
  }));

  // 2. Fetch approved and scheduled fixed plans
  const fixedDocs = await MaintenanceRequest.find({
    status: { $in: [RequestStatus.APPROVED, RequestStatus.SCHEDULED] },
  }).lean();

  const fixed_plans: BrainFixedPlanItem[] = [];

  for (const doc of fixedDocs) {
    // Check if there is an approved decision with an allocated window
    const decision = await ControllerDecision.findOne({
      requestId: doc.requestId,
      action: ControllerAction.APPROVE,
    })
      .sort({ createdAt: -1 })
      .lean();

    let allocatedStart = doc.earliestStart;
    let allocatedEnd = doc.latestEnd;

    if (decision?.selectedWindow?.start && decision?.selectedWindow?.end) {
      allocatedStart = decision.selectedWindow.start;
      allocatedEnd = decision.selectedWindow.end;
    }

    fixed_plans.push({
      request_id: doc.requestId,
      from_station: doc.fromStation,
      to_station: doc.toStation,
      allocated_start: toIsoDate(allocatedStart),
      allocated_end: toIsoDate(allocatedEnd),
      status: toBrainPlanningRequestStatus(doc.status),
    });
  }

  // 3. Determine Planning Mode
  // If active pending requests or fixed plans exist, mode is REPLAN; otherwise INITIAL
  const planningMode =
    pending_requests.length > 0 || fixed_plans.length > 0
      ? PlanningMode.REPLAN
      : PlanningMode.INITIAL;

  const rawPlanningState: BrainPlanningState = {
    version: planningVersion,
    planning_mode: planningMode,
    pending_requests,
    fixed_plans,
  };

  const planningState = normalizePlanningStateForBrain(rawPlanningState);

  return { planningState, planningMode };
}
