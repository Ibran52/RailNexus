import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { app } from '../src/server/app';
import { User } from '../src/server/models/User';
import { MaintenanceRequest } from '../src/server/models/MaintenanceRequest';
import { ControllerDecision } from '../src/server/models/ControllerDecision';
import { BrainRun } from '../src/server/models/BrainRun';
import { AuditLog } from '../src/server/models/AuditLog';
import {
  Role,
  Department,
  RequestStatus,
  ControllerAction,
  ErrorCode,
  PlanningMode,
  AuditAction,
} from '../src/server/config/constants';
import { brainClient } from '../src/server/services/brainClient';
import { BrainAnalyzeResponse } from '../src/server/types';
import * as eventService from '../src/server/services/eventService';

describe('Controller Decision Concurrency & Stale Plan Protection', () => {
  let controllerToken1: string;
  let controllerToken2: string;
  let engUserId: string;

  beforeEach(async () => {
    await User.deleteMany({});
    await MaintenanceRequest.deleteMany({});
    await ControllerDecision.deleteMany({});
    await BrainRun.deleteMany({});
    await AuditLog.deleteMany({});

    // Register Controller 1
    const ctrlRes1 = await request(app).post('/api/v1/auth/controller/register').send({
      name: 'Controller Alpha',
      email: 'ctrl.alpha@railway.gov.in',
      controllerId: 'Ctrl@1',
      password: 'Password123!',
      confirmPassword: 'Password123!',
    });
    controllerToken1 = ctrlRes1.body.data.token;

    // Register Controller 2
    const ctrlRes2 = await request(app).post('/api/v1/auth/controller/register').send({
      name: 'Controller Beta',
      email: 'ctrl.beta@railway.gov.in',
      controllerId: 'Ctrl@2',
      password: 'Password123!',
      confirmPassword: 'Password123!',
    });
    controllerToken2 = ctrlRes2.body.data.token;


    // Register Engineer
    const engRes = await request(app).post('/api/v1/auth/register').send({
      name: 'Eng 1',
      email: 'eng1@railway.gov.in',
      password: 'Password123!',
      role: Role.MAINTENANCE_ENGINEERING,
      department: Department.ENGINEERING,
    });
    engUserId = engRes.body.data.user.id;
  });

  it('two concurrent approvals: exactly one 200, exactly one 409, exactly one ControllerDecision', async () => {
    // Seed initial RECOMMENDED request with BrainRun
    const brainRun = await BrainRun.create({
      brainRunId: 'RUN-CONCUR-001',
      requestId: 'REQ-CONCUR-001',
      planningVersion: 1,
      planningMode: PlanningMode.INITIAL,
      recommendation: {
        start: new Date('2026-09-05T08:00:00Z'),
        end: new Date('2026-09-05T10:00:00Z'),
        impactScore: 18.5,
      },
      metrics: {
        totalCascadeDelayMinutes: 5,
        totalTrainsDelayed: 1,
        impactScore: 18.5,
      },
      conflicts: [],
      alternatives: [],
    });

    await MaintenanceRequest.create({
      requestId: 'REQ-CONCUR-001',
      createdBy: engUserId,
      department: Department.ENGINEERING,
      maintenanceType: 'TRACK_TAMPING',
      fromStation: 'NDLS',
      toStation: 'CNB',
      durationMinutes: 120,
      earliestStart: new Date('2026-09-05T06:00:00Z'),
      latestEnd: new Date('2026-09-05T12:00:00Z'),
      status: RequestStatus.RECOMMENDED,
      currentBrainRunId: brainRun.brainRunId,
      planningVersion: 1,
    });

    // Execute true parallel requests
    const [res1, res2] = await Promise.all([
      request(app)
        .post('/api/v1/controller/requests/REQ-CONCUR-001/approve')
        .set('Authorization', `Bearer ${controllerToken1}`)
        .send({
          reason: 'Controller 1 approving track tamping slot',
        }),
      request(app)
        .post('/api/v1/controller/requests/REQ-CONCUR-001/approve')
        .set('Authorization', `Bearer ${controllerToken2}`)
        .send({
          reason: 'Controller 2 approving track tamping slot',
        }),
    ]);

    const statuses = [res1.status, res2.status].sort();
    expect(statuses).toEqual([200, 409]);

    const winner = res1.status === 200 ? res1 : res2;
    const loser = res1.status === 409 ? res1 : res2;

    expect(winner.body.success).toBe(true);
    expect(winner.body.data.request.status).toBe(RequestStatus.APPROVED);

    expect(loser.body.success).toBe(false);
    expect(loser.body.error.code).toBe(ErrorCode.REQUEST_ALREADY_DECIDED);

    // Exactly one ControllerDecision record must exist
    const decisions = await ControllerDecision.find({ requestId: 'REQ-CONCUR-001' });
    expect(decisions).toHaveLength(1);
    expect(decisions[0].action).toBe(ControllerAction.APPROVE);

    // Persisted request status must be APPROVED
    const persistedRequest = await MaintenanceRequest.findOne({ requestId: 'REQ-CONCUR-001' });
    expect(persistedRequest?.status).toBe(RequestStatus.APPROVED);
  });

  it('approve vs modify in parallel: exactly one wins, loser returns 409, DB state remains valid', async () => {
    const brainRun = await BrainRun.create({
      brainRunId: 'RUN-CONCUR-002',
      requestId: 'REQ-CONCUR-002',
      planningVersion: 2,
      planningMode: PlanningMode.INITIAL,
      recommendation: {
        start: new Date('2026-09-05T08:00:00Z'),
        end: new Date('2026-09-05T10:00:00Z'),
        impactScore: 12.0,
      },
      metrics: {
        totalCascadeDelayMinutes: 0,
        totalTrainsDelayed: 0,
        impactScore: 12.0,
      },
      conflicts: [],
      alternatives: [],
    });

    await MaintenanceRequest.create({
      requestId: 'REQ-CONCUR-002',
      createdBy: engUserId,
      department: Department.ENGINEERING,
      maintenanceType: 'OHE_INSPECTION',
      fromStation: 'GZB',
      toStation: 'MB',
      durationMinutes: 90,
      earliestStart: new Date('2026-09-05T06:00:00Z'),
      latestEnd: new Date('2026-09-05T12:00:00Z'),
      status: RequestStatus.RECOMMENDED,
      currentBrainRunId: brainRun.brainRunId,
      planningVersion: 2,
    });

    // Mock Brain for modify replan
    const mockBrainResponse: BrainAnalyzeResponse = {
      success: true,
      brain_run_id: 'RUN-REPLAN-999',
      request_id: 'REQ-CONCUR-002',
      status: 'RECOMMENDED',
      recommendation: {
        start: '2026-09-05T09:00:00Z',
        end: '2026-09-05T10:30:00Z',
        impact_score: 8.5,
      },
      metrics: {
        total_cascade_delay_minutes: 0,
        total_trains_delayed: 0,
        impact_score: 8.5,
      },
      conflicts: [],
      alternatives: [],
    };
    vi.spyOn(brainClient, 'analyzeMaintenanceWindow').mockResolvedValue(mockBrainResponse);

    // Send approve and modify concurrently
    const [approveRes, modifyRes] = await Promise.all([
      request(app)
        .post('/api/v1/controller/requests/REQ-CONCUR-002/approve')
        .set('Authorization', `Bearer ${controllerToken1}`)
        .send({
          reason: 'Approve current plan',
        }),
      request(app)
        .post('/api/v1/controller/requests/REQ-CONCUR-002/modify')
        .set('Authorization', `Bearer ${controllerToken2}`)
        .send({
          earliestStart: '2026-09-05T07:00:00Z',
          latestEnd: '2026-09-05T11:00:00Z',
          reason: 'Modify window boundaries',
        }),
    ]);

    const statuses = [approveRes.status, modifyRes.status].sort();
    expect(statuses).toEqual([200, 409]);

    const persisted = await MaintenanceRequest.findOne({ requestId: 'REQ-CONCUR-002' });
    // It must end up in either APPROVED or RECOMMENDED (with replan), never an invalid transient state
    expect([RequestStatus.APPROVED, RequestStatus.RECOMMENDED]).toContain(persisted?.status);

    if (approveRes.status === 200) {
      expect(modifyRes.status).toBe(409);
      expect(modifyRes.body.error.code).toBe(ErrorCode.REQUEST_ALREADY_DECIDED);
      expect(persisted?.status).toBe(RequestStatus.APPROVED);
    } else {
      expect(approveRes.status).toBe(409);
      expect(approveRes.body.error.code).toBe(ErrorCode.REQUEST_ALREADY_DECIDED);
      expect(persisted?.status).toBe(RequestStatus.RECOMMENDED);
    }
  });

  it('stale BrainRun approval: fails with 409 STALE_PLAN if client expectedBrainRunId does not match current', async () => {
    // Create request with RUN-002 as current
    await BrainRun.create({
      brainRunId: 'RUN-OLD-001',
      requestId: 'REQ-STALE-001',
      planningVersion: 1,
      planningMode: PlanningMode.INITIAL,
      recommendation: { start: new Date(), end: new Date(), impactScore: 50 },
      metrics: { totalCascadeDelayMinutes: 10, totalTrainsDelayed: 2, impactScore: 50 },
      conflicts: [],
      alternatives: [],
    });

    const activeBrainRun = await BrainRun.create({
      brainRunId: 'RUN-NEW-002',
      requestId: 'REQ-STALE-001',
      planningVersion: 2,
      planningMode: PlanningMode.INITIAL,
      recommendation: { start: new Date(), end: new Date(), impactScore: 10 },
      metrics: { totalCascadeDelayMinutes: 0, totalTrainsDelayed: 0, impactScore: 10 },
      conflicts: [],
      alternatives: [],
    });

    await MaintenanceRequest.create({
      requestId: 'REQ-STALE-001',
      createdBy: engUserId,
      department: Department.ENGINEERING,
      maintenanceType: 'TURNOUT_RENEWAL',
      fromStation: 'NDLS',
      toStation: 'TKJ',
      durationMinutes: 120,
      earliestStart: new Date('2026-09-05T06:00:00Z'),
      latestEnd: new Date('2026-09-05T12:00:00Z'),
      status: RequestStatus.RECOMMENDED,
      currentBrainRunId: activeBrainRun.brainRunId,
      planningVersion: 2,
    });

    // Controller tries to approve the old superseded RUN-OLD-001
    const res = await request(app)
      .post('/api/v1/controller/requests/REQ-STALE-001/approve')
      .set('Authorization', `Bearer ${controllerToken1}`)
      .send({
        expectedBrainRunId: 'RUN-OLD-001',
        expectedPlanningVersion: 1,
        reason: 'Attempting to approve stale plan RUN-OLD-001',
      });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe(ErrorCode.STALE_PLAN);

    // Verify request is still RECOMMENDED with RUN-NEW-002
    const reqAfter = await MaintenanceRequest.findOne({ requestId: 'REQ-STALE-001' });
    expect(reqAfter?.status).toBe(RequestStatus.RECOMMENDED);
    expect(reqAfter?.currentBrainRunId).toBe('RUN-NEW-002');

    // Verify no decision was created
    const decision = await ControllerDecision.findOne({ requestId: 'REQ-STALE-001' });
    expect(decision).toBeNull();
  });

  it('stale planningVersion approval: fails with 409 STALE_PLAN if expectedPlanningVersion does not match current', async () => {
    const activeBrainRun = await BrainRun.create({
      brainRunId: 'RUN-VER-003',
      requestId: 'REQ-STALE-002',
      planningVersion: 5,
      planningMode: PlanningMode.INITIAL,
      recommendation: { start: new Date(), end: new Date(), impactScore: 10 },
      metrics: { totalCascadeDelayMinutes: 0, totalTrainsDelayed: 0, impactScore: 10 },
      conflicts: [],
      alternatives: [],
    });

    await MaintenanceRequest.create({
      requestId: 'REQ-STALE-002',
      createdBy: engUserId,
      department: Department.ENGINEERING,
      maintenanceType: 'TURNOUT_RENEWAL',
      fromStation: 'NDLS',
      toStation: 'TKJ',
      durationMinutes: 120,
      earliestStart: new Date('2026-09-05T06:00:00Z'),
      latestEnd: new Date('2026-09-05T12:00:00Z'),
      status: RequestStatus.RECOMMENDED,
      currentBrainRunId: activeBrainRun.brainRunId,
      planningVersion: 5,
    });

    // Client provides stale planningVersion 4
    const res = await request(app)
      .post('/api/v1/controller/requests/REQ-STALE-002/approve')
      .set('Authorization', `Bearer ${controllerToken1}`)
      .send({
        expectedBrainRunId: 'RUN-VER-003',
        expectedPlanningVersion: 4, // Stale!
        reason: 'Attempting approval with stale planning version',
      });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe(ErrorCode.STALE_PLAN);
  });

  it('Modify final transition failure: returns 409 STALE_PLAN, creates no ControllerDecision, emits no SSE, creates no audit', async () => {
    const emitSpy = vi.spyOn(eventService, 'emitControllerEvent');
    emitSpy.mockClear();

    const initialBrainRun = await BrainRun.create({
      brainRunId: 'RUN-FAIL-INIT',
      requestId: 'REQ-FAIL-FINAL-01',
      planningVersion: 1,
      planningMode: PlanningMode.INITIAL,
      recommendation: {
        start: new Date('2026-09-05T07:00:00Z'),
        end: new Date('2026-09-05T09:00:00Z'),
        impactScore: 30,
      },
      metrics: { totalCascadeDelayMinutes: 5, totalTrainsDelayed: 1, impactScore: 30 },
      conflicts: [],
      alternatives: [],
    });

    await MaintenanceRequest.create({
      requestId: 'REQ-FAIL-FINAL-01',
      createdBy: engUserId,
      department: Department.ENGINEERING,
      maintenanceType: 'RAIL_RENEWAL',
      fromStation: 'NDLS',
      toStation: 'GZB',
      durationMinutes: 120,
      earliestStart: new Date('2026-09-05T06:00:00Z'),
      latestEnd: new Date('2026-09-05T12:00:00Z'),
      status: RequestStatus.RECOMMENDED,
      currentBrainRunId: initialBrainRun.brainRunId,
      planningVersion: 1,
    });

    // Mock Brain call to succeed, but while Brain is analyzing, concurrently mutate the request in MongoDB!
    const mockBrainResponse: BrainAnalyzeResponse = {
      success: true,
      brain_run_id: 'RUN-REPLAN-FAIL-999',
      request_id: 'REQ-FAIL-FINAL-01',
      status: 'RECOMMENDED',
      recommendation: {
        start: '2026-09-05T08:00:00Z',
        end: '2026-09-05T10:00:00Z',
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

    vi.spyOn(brainClient, 'analyzeMaintenanceWindow').mockImplementationOnce(async () => {
      // Simulate concurrent mutation while external Brain is running:
      // Another operation cancelled or updated the request so status is no longer ANALYZING
      await MaintenanceRequest.updateOne(
        { requestId: 'REQ-FAIL-FINAL-01' },
        { $set: { status: RequestStatus.CANCELLED } }
      );
      return mockBrainResponse;
    });

    const res = await request(app)
      .post('/api/v1/controller/requests/REQ-FAIL-FINAL-01/modify')
      .set('Authorization', `Bearer ${controllerToken1}`)
      .send({
        earliestStart: '2026-09-05T07:00:00Z',
        latestEnd: '2026-09-05T11:00:00Z',
        reason: 'Adjusting boundaries',
      });

    // 1. Must return 409 conflict
    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe(ErrorCode.STALE_PLAN);

    // 2. NO successful ControllerDecision record created
    const decisions = await ControllerDecision.find({ requestId: 'REQ-FAIL-FINAL-01' });
    expect(decisions).toHaveLength(0);

    // 3. NO REQUEST_MODIFIED AuditLog entry created
    const audits = await AuditLog.find({
      entityId: 'REQ-FAIL-FINAL-01',
      action: AuditAction.REQUEST_MODIFIED,
    });
    expect(audits).toHaveLength(0);

    // 4. NO PLAN_REANALYZED or REQUEST_MODIFIED SSE event emitted
    const sseCalls = emitSpy.mock.calls.filter(
      ([event]) => event === 'PLAN_REANALYZED' || event === 'REQUEST_MODIFIED'
    );
    expect(sseCalls).toHaveLength(0);

    // 5. BrainRun was persisted and remains historical
    const historicalRun = await BrainRun.findOne({ brainRunId: 'RUN-REPLAN-FAIL-999' });
    expect(historicalRun).not.toBeNull();

    // 6. Persisted request does NOT claim status RECOMMENDED
    const reqDoc = await MaintenanceRequest.findOne({ requestId: 'REQ-FAIL-FINAL-01' });
    expect(reqDoc?.status).toBe(RequestStatus.CANCELLED);
    expect(reqDoc?.currentBrainRunId).toBe('RUN-FAIL-INIT');
  });
});
