import { describe, it, expect, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import {
  incrementPlanningVersion,
  getCurrentPlanningVersion,
} from '../src/server/models/PlanningStateCounter';
import {
  constructPlanningState,
  toBrainPlanningRequestStatus,
  normalizePlanningStateForBrain,
} from '../src/server/services/planningService';
import { MaintenanceRequest } from '../src/server/models/MaintenanceRequest';
import { ControllerDecision } from '../src/server/models/ControllerDecision';
import {
  Department,
  PlanningMode,
  RequestPriority,
  RequestStatus,
  BrainPlanningRequestStatus,
  ControllerAction,
} from '../src/server/config/constants';

describe('Planning State Service & Versioning', () => {
  beforeEach(async () => {
    await MaintenanceRequest.deleteMany({});
    await ControllerDecision.deleteMany({});
  });

  it('should increment planning version monotonically', async () => {
    const v1 = await incrementPlanningVersion();
    const v2 = await incrementPlanningVersion();
    const v3 = await incrementPlanningVersion();

    expect(v2).toBe(v1 + 1);
    expect(v3).toBe(v2 + 1);

    const current = await getCurrentPlanningVersion();
    expect(current).toBe(v3);
  });

  it('should generate INITIAL planning mode when zero approved plans exist', async () => {
    const version = await incrementPlanningVersion();
    const { planningState, planningMode } = await constructPlanningState('REQ-TEST-001', version);

    expect(planningMode).toBe(PlanningMode.INITIAL);
    expect(planningState.version).toBe(version);
    expect(planningState.fixed_plans).toHaveLength(0);
    expect(planningState.pending_requests).toHaveLength(0);
  });

  it('should generate REPLAN planning mode when approved fixed plans exist and include allocated windows', async () => {
    const dummyUser = new mongoose.Types.ObjectId();

    // Create an approved request
    await MaintenanceRequest.create({
      requestId: 'REQ-APPROVED-001',
      createdBy: dummyUser,
      department: Department.ENGINEERING,
      maintenanceType: 'TRACK_TAMPING',
      fromStation: 'NDLS',
      toStation: 'CNB',
      durationMinutes: 120,
      earliestStart: new Date('2026-09-05T06:00:00Z'),
      latestEnd: new Date('2026-09-05T10:00:00Z'),
      priority: RequestPriority.HIGH,
      status: RequestStatus.APPROVED,
    });

    // Create ControllerDecision with allocated window
    await ControllerDecision.create({
      decisionId: 'DEC-001',
      requestId: 'REQ-APPROVED-001',
      brainRunId: 'BRUN-001',
      action: ControllerAction.APPROVE,
      reason: 'Approved for Sunday corridor',
      controllerId: dummyUser,
      selectedWindow: {
        start: new Date('2026-09-05T06:30:00Z'),
        end: new Date('2026-09-05T08:30:00Z'),
      },
    });

    const version = await incrementPlanningVersion();
    const { planningState, planningMode } = await constructPlanningState('REQ-NEW-002', version);

    expect(planningMode).toBe(PlanningMode.REPLAN);
    expect(planningState.fixed_plans).toHaveLength(1);
    expect(planningState.fixed_plans[0].request_id).toBe('REQ-APPROVED-001');
    expect(planningState.fixed_plans[0].allocated_start).toBe(new Date('2026-09-05T06:30:00Z').toISOString());
    expect(planningState.fixed_plans[0].allocated_end).toBe(new Date('2026-09-05T08:30:00Z').toISOString());
  });

  it('should include PENDING, ANALYZING, RECOMMENDED in pending_requests and exclude target request itself', async () => {
    const dummyUser = new mongoose.Types.ObjectId();

    // Target request itself (should be excluded)
    await MaintenanceRequest.create({
      requestId: 'REQ-TARGET-001',
      createdBy: dummyUser,
      department: Department.ENGINEERING,
      maintenanceType: 'BALLAST_CLEANING',
      fromStation: 'NDLS',
      toStation: 'GZB',
      durationMinutes: 60,
      earliestStart: new Date('2026-09-05T04:00:00Z'),
      latestEnd: new Date('2026-09-05T08:00:00Z'),
      priority: RequestPriority.MEDIUM,
      status: RequestStatus.PENDING,
    });

    // Other pending request (should be included)
    await MaintenanceRequest.create({
      requestId: 'REQ-OTHER-002',
      createdBy: dummyUser,
      department: Department.SNT,
      maintenanceType: 'SIGNAL_OVERHAUL',
      fromStation: 'GZB',
      toStation: 'ALJN',
      durationMinutes: 90,
      earliestStart: new Date('2026-09-05T05:00:00Z'),
      latestEnd: new Date('2026-09-05T09:00:00Z'),
      priority: RequestPriority.HIGH,
      status: RequestStatus.RECOMMENDED,
    });

    const version = await incrementPlanningVersion();
    const { planningState } = await constructPlanningState('REQ-TARGET-001', version);

    expect(planningState.pending_requests).toHaveLength(1);
    expect(planningState.pending_requests[0].request_id).toBe('REQ-OTHER-002');
    expect(planningState.pending_requests.find((p) => p.request_id === 'REQ-TARGET-001')).toBeUndefined();
  });

  describe('Brain PlanningState Status Contract Normalization', () => {
    it('TEST 1: Maintenance request in PENDING -> maps to PENDING', () => {
      expect(toBrainPlanningRequestStatus(RequestStatus.PENDING)).toBe(BrainPlanningRequestStatus.PENDING);
    });

    it('TEST 2: Maintenance request in ANALYZING -> Brain payload maps to PENDING', () => {
      expect(toBrainPlanningRequestStatus(RequestStatus.ANALYZING)).toBe(BrainPlanningRequestStatus.PENDING);
    });

    it('TEST 3: Maintenance request in MODIFIED -> Brain payload maps to PENDING', () => {
      expect(toBrainPlanningRequestStatus(RequestStatus.MODIFIED)).toBe(BrainPlanningRequestStatus.PENDING);
    });

    it('TEST 4: RECOMMENDED -> Brain payload contains RECOMMENDED', () => {
      expect(toBrainPlanningRequestStatus(RequestStatus.RECOMMENDED)).toBe(BrainPlanningRequestStatus.RECOMMENDED);
    });

    it('TEST 5: APPROVED -> maps to APPROVED for fixed_plans and remains fixed plan', () => {
      expect(toBrainPlanningRequestStatus(RequestStatus.APPROVED)).toBe(BrainPlanningRequestStatus.APPROVED);
    });

    it('TEST 6: SCHEDULED -> maps to SCHEDULED for fixed_plans and remains fixed plan', () => {
      expect(toBrainPlanningRequestStatus(RequestStatus.SCHEDULED)).toBe(BrainPlanningRequestStatus.SCHEDULED);
    });

    it('TEST 7: REJECTED -> maps to REJECTED and is excluded from active pending planning set', async () => {
      const dummyUser = new mongoose.Types.ObjectId();
      await MaintenanceRequest.create({
        requestId: 'REQ-REJECTED-001',
        createdBy: dummyUser,
        department: Department.ENGINEERING,
        maintenanceType: 'TAMPING',
        fromStation: 'NDLS',
        toStation: 'CNB',
        durationMinutes: 60,
        earliestStart: new Date('2026-09-05T01:00:00Z'),
        latestEnd: new Date('2026-09-05T03:00:00Z'),
        priority: RequestPriority.LOW,
        status: RequestStatus.REJECTED,
      });

      const version = await incrementPlanningVersion();
      const { planningState } = await constructPlanningState('REQ-NEW-001', version);
      expect(planningState.pending_requests.find((r) => r.request_id === 'REQ-REJECTED-001')).toBeUndefined();
      expect(planningState.fixed_plans.find((r) => r.request_id === 'REQ-REJECTED-001')).toBeUndefined();
    });

    it('TEST 8: COMPLETED -> excluded from active pending planning set', async () => {
      const dummyUser = new mongoose.Types.ObjectId();
      await MaintenanceRequest.create({
        requestId: 'REQ-COMPLETED-001',
        createdBy: dummyUser,
        department: Department.SNT,
        maintenanceType: 'POINT_CHECK',
        fromStation: 'NDLS',
        toStation: 'CNB',
        durationMinutes: 60,
        earliestStart: new Date('2026-09-05T01:00:00Z'),
        latestEnd: new Date('2026-09-05T03:00:00Z'),
        priority: RequestPriority.LOW,
        status: RequestStatus.COMPLETED,
      });

      const version = await incrementPlanningVersion();
      const { planningState } = await constructPlanningState('REQ-NEW-001', version);
      expect(planningState.pending_requests.find((r) => r.request_id === 'REQ-COMPLETED-001')).toBeUndefined();
      expect(planningState.fixed_plans.find((r) => r.request_id === 'REQ-COMPLETED-001')).toBeUndefined();
    });

    it('TEST 9: CANCELLED -> excluded from active pending planning set', async () => {
      const dummyUser = new mongoose.Types.ObjectId();
      await MaintenanceRequest.create({
        requestId: 'REQ-CANCELLED-001',
        createdBy: dummyUser,
        department: Department.OHE,
        maintenanceType: 'CABLE_REPAIR',
        fromStation: 'NDLS',
        toStation: 'CNB',
        durationMinutes: 60,
        earliestStart: new Date('2026-09-05T01:00:00Z'),
        latestEnd: new Date('2026-09-05T03:00:00Z'),
        priority: RequestPriority.LOW,
        status: RequestStatus.CANCELLED,
      });

      const version = await incrementPlanningVersion();
      const { planningState } = await constructPlanningState('REQ-NEW-001', version);
      expect(planningState.pending_requests.find((r) => r.request_id === 'REQ-CANCELLED-001')).toBeUndefined();
      expect(planningState.fixed_plans.find((r) => r.request_id === 'REQ-CANCELLED-001')).toBeUndefined();
    });

    it('PAYLOAD CONTRACT TEST: Outbound payload never contains ANALYZING or MODIFIED, and MongoDB records are unmutated', async () => {
      const dummyUser = new mongoose.Types.ObjectId();

      const requestsData = [
        { id: 'REQ-P', status: RequestStatus.PENDING },
        { id: 'REQ-A', status: RequestStatus.ANALYZING },
        { id: 'REQ-M', status: RequestStatus.MODIFIED },
        { id: 'REQ-R', status: RequestStatus.RECOMMENDED },
        { id: 'REQ-AP', status: RequestStatus.APPROVED },
        { id: 'REQ-SC', status: RequestStatus.SCHEDULED },
        { id: 'REQ-RJ', status: RequestStatus.REJECTED },
        { id: 'REQ-CM', status: RequestStatus.COMPLETED },
        { id: 'REQ-CN', status: RequestStatus.CANCELLED },
      ];

      for (const r of requestsData) {
        await MaintenanceRequest.create({
          requestId: r.id,
          createdBy: dummyUser,
          department: Department.ENGINEERING,
          maintenanceType: 'TRACK_TAMPING',
          fromStation: 'NDLS',
          toStation: 'CNB',
          durationMinutes: 60,
          earliestStart: new Date('2026-09-05T01:00:00Z'),
          latestEnd: new Date('2026-09-05T03:00:00Z'),
          priority: RequestPriority.MEDIUM,
          status: r.status,
        });
      }

      const version = await incrementPlanningVersion();
      const { planningState, planningMode } = await constructPlanningState('REQ-TARGET-MAIN', version);

      // Verify planning mode
      expect(planningMode).toBe(PlanningMode.REPLAN);

      // Verify pending_requests contains the flexible requests
      expect(planningState.pending_requests).toHaveLength(4);
      const pendingIds = planningState.pending_requests.map((p) => p.request_id);
      expect(pendingIds).toContain('REQ-P');
      expect(pendingIds).toContain('REQ-A');
      expect(pendingIds).toContain('REQ-M');
      expect(pendingIds).toContain('REQ-R');

      // Strict allowed Brain vocabulary
      const validBrainStatuses = new Set([
        'PENDING',
        'RECOMMENDED',
        'APPROVED',
        'SCHEDULED',
        'COMPLETED',
        'REJECTED',
        'CANCELLED',
      ]);

      for (const pr of planningState.pending_requests) {
        expect(validBrainStatuses.has(pr.status as string)).toBe(true);
        expect(pr.status).not.toBe('ANALYZING');
        expect(pr.status).not.toBe('MODIFIED');
      }

      // Assert mapped values in payload
      const reqA = planningState.pending_requests.find((p) => p.request_id === 'REQ-A');
      expect(reqA?.status).toBe(BrainPlanningRequestStatus.PENDING);

      const reqM = planningState.pending_requests.find((p) => p.request_id === 'REQ-M');
      expect(reqM?.status).toBe(BrainPlanningRequestStatus.PENDING);

      const reqR = planningState.pending_requests.find((p) => p.request_id === 'REQ-R');
      expect(reqR?.status).toBe(BrainPlanningRequestStatus.RECOMMENDED);

      // Verify fixed_plans contains APPROVED & SCHEDULED
      expect(planningState.fixed_plans).toHaveLength(2);
      const fixedIds = planningState.fixed_plans.map((f) => f.request_id);
      expect(fixedIds).toContain('REQ-AP');
      expect(fixedIds).toContain('REQ-SC');

      // CRITICAL: Database documents must NOT have been changed by normalization
      const dbReqA = await MaintenanceRequest.findOne({ requestId: 'REQ-A' }).lean();
      expect(dbReqA?.status).toBe(RequestStatus.ANALYZING);

      const dbReqM = await MaintenanceRequest.findOne({ requestId: 'REQ-M' }).lean();
      expect(dbReqM?.status).toBe(RequestStatus.MODIFIED);
    });
  });
});
