import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { app } from '../src/server/app';
import { User } from '../src/server/models/User';
import { MaintenanceRequest } from '../src/server/models/MaintenanceRequest';
import { ControllerDecision } from '../src/server/models/ControllerDecision';
import { BrainRun } from '../src/server/models/BrainRun';
import { AuditLog } from '../src/server/models/AuditLog';
import { PlanningStateCounter, getCurrentPlanningVersion } from '../src/server/models/PlanningStateCounter';
import {
  Role,
  Department,
  RequestStatus,
  ErrorCode,
  PlanningMode,
} from '../src/server/config/constants';
import { brainClient } from '../src/server/services/brainClient';
import { BrainAnalyzeRequest, BrainAnalyzeResponse } from '../src/server/types';

describe('RailNexus Critical System Scenarios', () => {
  let controllerToken: string;
  let engToken: string;
  let engUserId: string;

  beforeEach(async () => {
    await User.deleteMany({});
    await MaintenanceRequest.deleteMany({});
    await ControllerDecision.deleteMany({});
    await BrainRun.deleteMany({});
    await AuditLog.deleteMany({});
    await PlanningStateCounter.deleteMany({});

    // Register Controller
    const ctrlRes = await request(app).post('/api/v1/auth/controller/register').send({
      name: 'Chief Controller',
      email: 'chief.controller@railway.gov.in',
      controllerId: 'Chf@12',
      password: 'Password123!',
      confirmPassword: 'Password123!',
    });
    controllerToken = ctrlRes.body.data.token;


    // Register Engineer
    const engRes = await request(app).post('/api/v1/auth/register').send({
      name: 'Senior P-Way Eng',
      email: 'pway.eng@railway.gov.in',
      password: 'Password123!',
      role: Role.MAINTENANCE_ENGINEERING,
      department: Department.ENGINEERING,
    });
    engToken = engRes.body.data.token;
    engUserId = engRes.body.data.user.id;
  });

  it('Scenario 1: Approved Request A propagates to Request B planning_state.fixed_plans with allocated window', async () => {
    let capturedPayloadB: BrainAnalyzeRequest | null = null;

    // 1. Setup Brain mock for Request A
    const mockBrainResponseA: BrainAnalyzeResponse = {
      success: true,
      brain_run_id: 'RUN-SCENARIO-A',
      request_id: 'REQ-SCENARIO-A',
      status: 'RECOMMENDED',
      recommendation: {
        start: '2026-09-05T07:00:00.000Z',
        end: '2026-09-05T09:00:00.000Z',
        impact_score: 22.0,
      },
      metrics: {
        total_cascade_delay_minutes: 5,
        total_trains_delayed: 1,
        impact_score: 22.0,
      },
      conflicts: [],
      alternatives: [],
    };

    const analyzeSpy = vi.spyOn(brainClient, 'analyzeMaintenanceWindow');
    analyzeSpy.mockResolvedValueOnce(mockBrainResponseA);

    // Create Request A
    const resA = await request(app)
      .post('/api/v1/maintenance/requests')
      .set('Authorization', `Bearer ${engToken}`)
      .send({
        maintenanceType: 'RAIL_RENEWAL',
        fromStation: 'NDLS',
        toStation: 'CNB',
        durationMinutes: 120,
        earliestStart: '2026-09-05T06:00:00Z',
        latestEnd: '2026-09-05T12:00:00Z',
        priority: 'HIGH',
        description: 'Track Section A renewal',
      });

    expect(resA.status).toBe(201);
    const reqAId = resA.body.data.request.requestId;

    // Controller approves Request A
    const approveRes = await request(app)
      .post(`/api/v1/controller/requests/${reqAId}/approve`)
      .set('Authorization', `Bearer ${controllerToken}`)
      .send({
        reason: 'Approved for early morning window',
      });

    expect(approveRes.status).toBe(200);
    expect(approveRes.body.data.request.status).toBe(RequestStatus.APPROVED);

    // 2. Setup Brain mock for Request B and capture the payload
    const mockBrainResponseB: BrainAnalyzeResponse = {
      success: true,
      brain_run_id: 'RUN-SCENARIO-B',
      request_id: 'REQ-SCENARIO-B',
      status: 'RECOMMENDED',
      recommendation: {
        start: '2026-09-05T10:00:00.000Z',
        end: '2026-09-05T12:00:00.000Z',
        impact_score: 15.0,
      },
      metrics: {
        total_cascade_delay_minutes: 0,
        total_trains_delayed: 0,
        impact_score: 15.0,
      },
      conflicts: [],
      alternatives: [],
    };

    analyzeSpy.mockImplementationOnce(async (payload) => {
      capturedPayloadB = payload;
      return mockBrainResponseB;
    });

    // Create Request B
    const resB = await request(app)
      .post('/api/v1/maintenance/requests')
      .set('Authorization', `Bearer ${engToken}`)
      .send({
        maintenanceType: 'TURNOUT_RENEWAL',
        fromStation: 'CNB',
        toStation: 'PRYJ',
        durationMinutes: 120,
        earliestStart: '2026-09-05T08:00:00Z',
        latestEnd: '2026-09-05T14:00:00Z',
        priority: 'MEDIUM',
        description: 'Track Section B turnout',
      });

    expect(resB.status).toBe(201);
    expect(capturedPayloadB).not.toBeNull();

    // Verify PlanningState for B has A in fixed_plans, NOT in pending_requests
    const planningStateB = capturedPayloadB!.planning_state;
    expect(planningStateB).toBeDefined();

    const fixedPlanItem = planningStateB!.fixed_plans.find(
      (fp: any) => fp.request_id === reqAId
    );
    expect(fixedPlanItem).toBeDefined();
    expect(fixedPlanItem!.status).toBe(RequestStatus.APPROVED);
    expect(fixedPlanItem!.allocated_start).toBe('2026-09-05T07:00:00.000Z');
    expect(fixedPlanItem!.allocated_end).toBe('2026-09-05T09:00:00.000Z');

    const pendingItemA = planningStateB!.pending_requests.find(
      (pr: any) => pr.request_id === reqAId
    );
    expect(pendingItemA).toBeUndefined(); // A must NOT be pending!
  });

  it('Scenario 2: Same-section joint planning forwards active requests and persists Brain outcome', async () => {
    let capturedPayload: BrainAnalyzeRequest | null = null;

    // Seed Request 1 in RECOMMENDED state on section NDLS-CNB
    const req1 = await MaintenanceRequest.create({
      requestId: 'REQ-JOINT-001',
      createdBy: engUserId,
      department: Department.ENGINEERING,
      maintenanceType: 'RAIL_RENEWAL',
      fromStation: 'NDLS',
      toStation: 'CNB',
      durationMinutes: 120,
      earliestStart: new Date('2026-09-05T06:00:00Z'),
      latestEnd: new Date('2026-09-05T14:00:00Z'),
      status: RequestStatus.RECOMMENDED,
      planningVersion: 1,
    });

    const mockJointResponse: BrainAnalyzeResponse = {
      success: true,
      brain_run_id: 'RUN-JOINT-999',
      request_id: 'REQ-JOINT-002',
      status: 'RECOMMENDED',
      recommendation: {
        start: '2026-09-05T08:00:00.000Z',
        end: '2026-09-05T10:00:00.000Z',
        impact_score: 30.0,
      },
      metrics: {
        total_cascade_delay_minutes: 10,
        total_trains_delayed: 2,
        impact_score: 30.0,
      },
      conflicts: [],
      alternatives: [],
      bundles: [
        {
          bundle_id: 'BUN-NDLS-CNB-01',
          request_ids: ['REQ-JOINT-001', 'REQ-JOINT-002'],
          section: 'NDLS-CNB',
          combined_start: '2026-09-05T08:00:00.000Z',
          combined_end: '2026-09-05T10:00:00.000Z',
          combined_duration_minutes: 120,
          bundle_impact_score: 30.0,
          individual_impact_sum: 55.0,
          recommendation: 'BUNDLE',
        },
      ],
    };

    vi.spyOn(brainClient, 'analyzeMaintenanceWindow').mockImplementationOnce(async (payload) => {
      capturedPayload = payload;
      return mockJointResponse;
    });

    // Create Request 2 on the exact same section
    const res2 = await request(app)
      .post('/api/v1/maintenance/requests')
      .set('Authorization', `Bearer ${engToken}`)
      .send({
        maintenanceType: 'OHE_INSPECTION',
        fromStation: 'NDLS',
        toStation: 'CNB',
        durationMinutes: 90,
        earliestStart: '2026-09-05T07:00:00Z',
        latestEnd: '2026-09-05T12:00:00Z',
        priority: 'MEDIUM',
        description: 'OHE inspection on same section',
      });

    expect(res2.status).toBe(201);
    expect(capturedPayload).not.toBeNull();

    // Verify target request and joint planning context were sent to Brain
    expect(capturedPayload!.request_id).toBe(res2.body.data.request.requestId);
    const pendingIds = capturedPayload!.planning_state!.pending_requests.map((r: any) => r.request_id);
    expect(pendingIds).toContain('REQ-JOINT-001');

    // Verify Brain outcome was persisted in BrainRun with bundle
    const persistedRun = await BrainRun.findOne({ brainRunId: 'RUN-JOINT-999' });
    expect(persistedRun?.bundles).toBeDefined();
    expect(persistedRun!.bundles).toHaveLength(1);
    expect(persistedRun!.bundles![0].bundle_id).toBe('BUN-NDLS-CNB-01');
  });

  it('Scenario 3: Brain outage keeps request retry-safe in ANALYZING with NO fake recommendation', async () => {
    // Mock Brain outage
    const outageErr: any = new Error('connect ECONNREFUSED 127.0.0.1:8000');
    outageErr.code = ErrorCode.BRAIN_UNAVAILABLE;
    outageErr.statusCode = 503;
    vi.spyOn(brainClient, 'analyzeMaintenanceWindow').mockRejectedValueOnce(outageErr);

    const res = await request(app)
      .post('/api/v1/maintenance/requests')
      .set('Authorization', `Bearer ${engToken}`)
      .send({
        maintenanceType: 'RAIL_RENEWAL',
        fromStation: 'NDLS',
        toStation: 'GZB',
        durationMinutes: 120,
        earliestStart: '2026-09-05T06:00:00Z',
        latestEnd: '2026-09-05T12:00:00Z',
        priority: 'HIGH',
      });

    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe(ErrorCode.BRAIN_UNAVAILABLE);

    // Request remains persisted and in retry-safe ANALYZING state
    const persistedRequests = await MaintenanceRequest.find({ fromStation: 'NDLS', toStation: 'GZB' });
    expect(persistedRequests).toHaveLength(1);
    const req = persistedRequests[0];
    expect(req.status).toBe(RequestStatus.ANALYZING);
    expect(req.currentBrainRunId).toBeUndefined();

    // NO fake BrainRun document was created
    const brainRuns = await BrainRun.find({ requestId: req.requestId });
    expect(brainRuns).toHaveLength(0);

    // NO fake decision was created
    const decisions = await ControllerDecision.find({ requestId: req.requestId });
    expect(decisions).toHaveLength(0);
  });

  it('Scenario 4: BrainRun immutability across re-plans (RUN-001 is never mutated into RUN-002)', async () => {
    // 1. Initial analysis produces RUN-IMM-001
    const run1 = await BrainRun.create({
      brainRunId: 'RUN-IMM-001',
      requestId: 'REQ-IMM-001',
      planningVersion: 1,
      planningMode: PlanningMode.INITIAL,
      recommendation: {
        start: new Date('2026-09-05T07:00:00Z'),
        end: new Date('2026-09-05T09:00:00Z'),
        impactScore: 40.0,
      },
      metrics: {
        totalCascadeDelayMinutes: 20,
        totalTrainsDelayed: 3,
        impactScore: 40.0,
      },
      conflicts: [],
      alternatives: [],
    });

    await MaintenanceRequest.create({
      requestId: 'REQ-IMM-001',
      createdBy: engUserId,
      department: Department.ENGINEERING,
      maintenanceType: 'BALLAST_CLEANING',
      fromStation: 'CNB',
      toStation: 'ALD',
      durationMinutes: 120,
      earliestStart: new Date('2026-09-05T06:00:00Z'),
      latestEnd: new Date('2026-09-05T12:00:00Z'),
      status: RequestStatus.RECOMMENDED,
      currentBrainRunId: run1.brainRunId,
      planningVersion: 1,
    });

    // 2. Controller modifies request -> replan produces RUN-IMM-002
    const mockReplanResponse: BrainAnalyzeResponse = {
      success: true,
      brain_run_id: 'RUN-IMM-002',
      request_id: 'REQ-IMM-001',
      status: 'RECOMMENDED',
      recommendation: {
        start: '2026-09-05T08:00:00.000Z',
        end: '2026-09-05T10:00:00.000Z',
        impact_score: 15.0,
      },
      metrics: {
        total_cascade_delay_minutes: 0,
        total_trains_delayed: 0,
        impact_score: 15.0,
      },
      conflicts: [],
      alternatives: [],
    };
    vi.spyOn(brainClient, 'analyzeMaintenanceWindow').mockResolvedValueOnce(mockReplanResponse);

    const modifyRes = await request(app)
      .post('/api/v1/controller/requests/REQ-IMM-001/modify')
      .set('Authorization', `Bearer ${controllerToken}`)
      .send({
        earliestStart: '2026-09-05T07:30:00Z',
        latestEnd: '2026-09-05T11:00:00Z',
        reason: 'Shift window later to avoid express train bunching',
      });

    expect(modifyRes.status).toBe(200);

    // 3. Verify RUN-IMM-001 was NOT overwritten or modified
    const run1After = await BrainRun.findOne({ brainRunId: 'RUN-IMM-001' });
    expect(run1After).not.toBeNull();
    expect(run1After?.metrics.impactScore).toBe(40.0);
    expect(run1After?.planningVersion).toBe(1);

    // Verify RUN-IMM-002 exists as a separate document
    const run2After = await BrainRun.findOne({ brainRunId: 'RUN-IMM-002' });
    expect(run2After).not.toBeNull();
    expect(run2After?.metrics.impact_score).toBe(15.0);

    // Verify the request now points to RUN-IMM-002
    const reqAfter = await MaintenanceRequest.findOne({ requestId: 'REQ-IMM-001' });
    expect(reqAfter?.currentBrainRunId).toBe('RUN-IMM-002');
  });

  it('Scenario 5: What-If simulation causes zero operational DB mutation', async () => {
    // Seed initial operational state
    const run = await BrainRun.create({
      brainRunId: 'RUN-OP-001',
      requestId: 'REQ-OP-001',
      planningVersion: 1,
      planningMode: PlanningMode.INITIAL,
      recommendation: {
        start: new Date('2026-09-05T08:00:00Z'),
        end: new Date('2026-09-05T10:00:00Z'),
        impactScore: 20.0,
      },
      metrics: {
        totalCascadeDelayMinutes: 5,
        totalTrainsDelayed: 1,
        impactScore: 20.0,
      },
      conflicts: [],
      alternatives: [],
    });

    await MaintenanceRequest.create({
      requestId: 'REQ-OP-001',
      createdBy: engUserId,
      department: Department.ENGINEERING,
      maintenanceType: 'RAIL_RENEWAL',
      fromStation: 'NDLS',
      toStation: 'CNB',
      durationMinutes: 120,
      earliestStart: new Date('2026-09-05T06:00:00Z'),
      latestEnd: new Date('2026-09-05T12:00:00Z'),
      status: RequestStatus.RECOMMENDED,
      currentBrainRunId: run.brainRunId,
      planningVersion: 1,
    });

    // Capture DB state BEFORE What-If
    const requestsBefore = await MaintenanceRequest.find({}).lean();
    const planningVersionBefore = await getCurrentPlanningVersion();
    const brainRunsCountBefore = await BrainRun.countDocuments();
    const decisionsCountBefore = await ControllerDecision.countDocuments();
    const auditCountBefore = await AuditLog.countDocuments();

    // Mock Brain for What-If
    const mockWhatIfResponse: BrainAnalyzeResponse = {
      success: true,
      brain_run_id: 'RUN-WHATIF-TEST',
      request_id: 'REQ-OP-001',
      status: 'RECOMMENDED',
      recommendation: {
        start: '2026-09-05T09:30:00Z',
        end: '2026-09-05T11:30:00Z',
        impact_score: 11.5,
      },
      metrics: {
        total_cascade_delay_minutes: 0,
        total_trains_delayed: 0,
        impact_score: 11.5,
      },
      conflicts: [],
      alternatives: [],
    };
    vi.spyOn(brainClient, 'analyzeMaintenanceWindow').mockResolvedValueOnce(mockWhatIfResponse);

    // Call What-If endpoint
    const whatIfRes = await request(app)
      .post('/api/v1/controller/what-if')
      .set('Authorization', `Bearer ${controllerToken}`)
      .send({
        requestId: 'REQ-OP-001',
        proposedStart: '2026-09-05T09:00:00Z',
        proposedEnd: '2026-09-05T13:00:00Z',
      });

    expect(whatIfRes.status).toBe(200);
    expect(whatIfRes.body.success).toBe(true);
    expect(whatIfRes.body.data.simulationResult.recommendation.impact_score).toBe(11.5);

    // Capture DB state AFTER What-If
    const requestsAfter = await MaintenanceRequest.find({}).lean();
    const planningVersionAfter = await getCurrentPlanningVersion();
    const brainRunsCountAfter = await BrainRun.countDocuments();
    const decisionsCountAfter = await ControllerDecision.countDocuments();
    const auditCountAfter = await AuditLog.countDocuments();

    // Verify complete operational DB state isolation
    expect(requestsAfter).toEqual(requestsBefore);
    expect(planningVersionAfter).toBe(planningVersionBefore);
    expect(brainRunsCountAfter).toBe(brainRunsCountBefore);
    expect(decisionsCountAfter).toBe(decisionsCountBefore);
    expect(auditCountAfter).toBe(auditCountBefore);
  });
});
