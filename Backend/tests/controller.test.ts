import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import http from 'http';
import { app } from '../src/server/app';
import { User } from '../src/server/models/User';
import { MaintenanceRequest } from '../src/server/models/MaintenanceRequest';
import { ControllerDecision } from '../src/server/models/ControllerDecision';
import { BrainRun } from '../src/server/models/BrainRun';
import {
  Role,
  Department,
  RequestStatus,
  ControllerAction,
  ErrorCode,
} from '../src/server/config/constants';

import { brainClient } from '../src/server/services/brainClient';
import { BrainAnalyzeResponse } from '../src/server/types';

describe('Controller Decision Workflow & Actions', () => {
  let controllerToken: string;
  let engToken: string;
  let engUserId: string;

  beforeEach(async () => {
    await User.deleteMany({});
    await MaintenanceRequest.deleteMany({});
    await ControllerDecision.deleteMany({});
    await BrainRun.deleteMany({});

    // Register Controller
    const ctrlRes = await request(app).post('/api/v1/auth/controller/register').send({
      name: 'Section Controller 1',
      email: 'ctrl1@railway.gov.in',
      controllerId: 'Sec@01',
      password: 'Password123!',
      confirmPassword: 'Password123!',
    });
    controllerToken = ctrlRes.body.data.token;

    // Register Engineer
    const engRes = await request(app).post('/api/v1/auth/register').send({
      name: 'Eng 1',
      email: 'eng1@railway.gov.in',
      password: 'Password123!',
      role: Role.MAINTENANCE_ENGINEERING,
      department: Department.ENGINEERING,
    });
    engToken = engRes.body.data.token;
    engUserId = engRes.body.data.user.id;
  });

  it('should allow Controller to APPROVE a RECOMMENDED request and persist decision record', async () => {
    await MaintenanceRequest.create({
      requestId: 'REQ-DEC-001',
      createdBy: engUserId,
      department: Department.ENGINEERING,
      maintenanceType: 'RAIL_RENEWAL',
      fromStation: 'NDLS',
      toStation: 'GZB',
      durationMinutes: 120,
      earliestStart: new Date('2026-09-05T06:00:00Z'),
      latestEnd: new Date('2026-09-05T12:00:00Z'),
      status: RequestStatus.RECOMMENDED,
      planningVersion: 1,
    });

    const res = await request(app)
      .post('/api/v1/controller/approve')
      .set('Authorization', `Bearer ${controllerToken}`)
      .send({
        requestId: 'REQ-DEC-001',
        reason: 'Approved for Sunday morning corridor',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.request.status).toBe(RequestStatus.APPROVED);
    expect(res.body.data.decision.action).toBe(ControllerAction.APPROVE);

    // Verify Decision in DB
    const decision = await ControllerDecision.findOne({ requestId: 'REQ-DEC-001' });
    expect(decision).toBeDefined();
    expect(decision?.action).toBe(ControllerAction.APPROVE);
    expect(decision?.reason).toBe('Approved for Sunday morning corridor');
  });

  it('P1-ApprovalSync: Controller approves request -> DB status APPROVED -> Worker retrieves APPROVED via GET /requests and GET /requests/:requestId', async () => {
    // 1. Create request
    await MaintenanceRequest.create({
      requestId: 'REQ-SYNC-001',
      createdBy: engUserId,
      department: Department.ENGINEERING,
      maintenanceType: 'TRACK_TAMPING',
      fromStation: 'MLND',
      toStation: 'TNA',
      durationMinutes: 120,
      earliestStart: new Date('2026-09-07T02:00:00Z'),
      latestEnd: new Date('2026-09-07T06:00:00Z'),
      status: RequestStatus.RECOMMENDED,
      planningVersion: 1,
    });

    // 2. Controller approves
    const approveRes = await request(app)
      .post('/api/v1/controller/requests/REQ-SYNC-001/approve')
      .set('Authorization', `Bearer ${controllerToken}`)
      .send({ reason: 'Approved slot without delay' });

    expect(approveRes.status).toBe(200);
    expect(approveRes.body.data.request.status).toBe(RequestStatus.APPROVED);

    // 3. Gate A: DB verification
    const dbDoc = await MaintenanceRequest.findOne({ requestId: 'REQ-SYNC-001' });
    expect(dbDoc?.status).toBe(RequestStatus.APPROVED);

    // 4. Gate B: Worker GET /maintenance/requests returns APPROVED
    const workerListRes = await request(app)
      .get('/api/v1/maintenance/requests')
      .set('Authorization', `Bearer ${engToken}`);

    expect(workerListRes.status).toBe(200);
    const found = workerListRes.body.data.requests.find((r: any) => r.requestId === 'REQ-SYNC-001');
    expect(found).toBeDefined();
    expect(found.status).toBe(RequestStatus.APPROVED);

    // 5. Gate C: Worker GET /maintenance/requests/REQ-SYNC-001 returns APPROVED with decision
    const workerDetailRes = await request(app)
      .get('/api/v1/maintenance/requests/REQ-SYNC-001')
      .set('Authorization', `Bearer ${engToken}`);

    expect(workerDetailRes.status).toBe(200);
    expect(workerDetailRes.body.data.request.status).toBe(RequestStatus.APPROVED);
    expect(workerDetailRes.body.data.decision).toBeDefined();
    expect(workerDetailRes.body.data.decision.action).toBe(ControllerAction.APPROVE);

    // 6. Gate G: Cross-department worker cannot view REQ-SYNC-001 (403 FORBIDDEN)
    const sntRes = await request(app).post('/api/v1/auth/register').send({
      name: 'SNT Worker',
      email: 'snt_sync@railway.gov.in',
      password: 'Password123!',
      role: Role.MAINTENANCE_SNT,
      department: Department.SNT,
    });
    const sntToken = sntRes.body.data.token;

    const crossDeptRes = await request(app)
      .get('/api/v1/maintenance/requests/REQ-SYNC-001')
      .set('Authorization', `Bearer ${sntToken}`);
    expect(crossDeptRes.status).toBe(403);
  });

  it('should allow maintenance worker to connect to /api/v1/maintenance/events with 200 text/event-stream', async () => {
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const addr = server.address() as any;
    const port = addr.port;

    try {
      await new Promise<void>((resolve, reject) => {
        const req = http.get(
          `http://127.0.0.1:${port}/api/v1/maintenance/events`,
          { headers: { Authorization: `Bearer ${engToken}` } },
          (res) => {
            try {
              expect(res.statusCode).toBe(200);
              expect(res.headers['content-type']).toContain('text/event-stream');
              res.on('data', (chunk) => {
                const text = chunk.toString();
                if (text.includes('event: CONNECTED')) {
                  res.destroy();
                  resolve();
                }
              });
            } catch (err) {
              res.destroy();
              reject(err);
            }
          }
        );
        req.on('error', reject);
      });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('should block maintenance engineer from calling controller approve endpoint (403 FORBIDDEN)', async () => {
    await MaintenanceRequest.create({
      requestId: 'REQ-DEC-002',
      createdBy: engUserId,
      department: Department.ENGINEERING,
      maintenanceType: 'RAIL_RENEWAL',
      fromStation: 'NDLS',
      toStation: 'GZB',
      durationMinutes: 60,
      earliestStart: new Date('2026-09-05T06:00:00Z'),
      latestEnd: new Date('2026-09-05T12:00:00Z'),
      status: RequestStatus.RECOMMENDED,
      planningVersion: 1,
    });

    const res = await request(app)
      .post('/api/v1/controller/approve')
      .set('Authorization', `Bearer ${engToken}`)
      .send({
        requestId: 'REQ-DEC-002',
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('should allow Controller to REJECT a request with mandatory reason', async () => {
    await MaintenanceRequest.create({
      requestId: 'REQ-DEC-003',
      createdBy: engUserId,
      department: Department.ENGINEERING,
      maintenanceType: 'RAIL_RENEWAL',
      fromStation: 'NDLS',
      toStation: 'GZB',
      durationMinutes: 120,
      earliestStart: new Date('2026-09-05T06:00:00Z'),
      latestEnd: new Date('2026-09-05T12:00:00Z'),
      status: RequestStatus.RECOMMENDED,
      planningVersion: 1,
    });

    // Attempt reject without reason
    const failRes = await request(app)
      .post('/api/v1/controller/reject')
      .set('Authorization', `Bearer ${controllerToken}`)
      .send({
        requestId: 'REQ-DEC-003',
      });

    expect(failRes.status).toBe(400);

    // Reject with valid reason
    const successRes = await request(app)
      .post('/api/v1/controller/reject')
      .set('Authorization', `Bearer ${controllerToken}`)
      .send({
        requestId: 'REQ-DEC-003',
        reason: 'Severe conflict with Vande Bharat express during festive rush',
      });

    expect(successRes.status).toBe(200);
    expect(successRes.body.data.request.status).toBe(RequestStatus.REJECTED);
  });

  it('should trigger Brain replan on MODIFY and transition through MODIFIED/ANALYZING to RECOMMENDED', async () => {
    await MaintenanceRequest.create({
      requestId: 'REQ-DEC-004',
      createdBy: engUserId,
      department: Department.ENGINEERING,
      maintenanceType: 'RAIL_RENEWAL',
      fromStation: 'NDLS',
      toStation: 'GZB',
      durationMinutes: 120,
      earliestStart: new Date('2026-09-05T06:00:00Z'),
      latestEnd: new Date('2026-09-05T12:00:00Z'),
      status: RequestStatus.RECOMMENDED,
      planningVersion: 1,
    });

    const mockReplannedBrain: BrainAnalyzeResponse = {
      success: true,
      request_id: 'REQ-DEC-004',
      recommendation: {
        start: '2026-09-05T08:00:00.000Z',
        end: '2026-09-05T09:30:00.000Z',
        impact_score: 18.2,
      },
      metrics: {
        impact_score: 18.2,
      },
      conflicts: [],
      alternatives: [],
    };

    vi.spyOn(brainClient, 'analyzeMaintenanceWindow').mockResolvedValueOnce(mockReplannedBrain);

    const res = await request(app)
      .post('/api/v1/controller/modify')
      .set('Authorization', `Bearer ${controllerToken}`)
      .send({
        requestId: 'REQ-DEC-004',
        modifiedDurationMinutes: 90,
        reason: 'Reduced duration from 120 to 90 min to clear fast traffic',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.request.status).toBe(RequestStatus.RECOMMENDED);
    expect(res.body.data.request.durationMinutes).toBe(90);
    expect(res.body.data.brainRun).toBeDefined();

    // Verify Decision in DB
    const decision = await ControllerDecision.findOne({
      requestId: 'REQ-DEC-004',
      action: ControllerAction.MODIFY,
    });
    expect(decision).toBeDefined();
    expect(decision?.reason).toContain('Reduced duration');
  });

  // P1-1: Controller History Pagination Test
  it('P1-1: should support paginated getHistory with metadata and reject invalid bounds', async () => {
    // 1. Create a few decisions
    await ControllerDecision.create([
      {
        decisionId: 'DEC-HIST-01',
        requestId: 'REQ-HIST-01',
        brainRunId: 'RUN-HIST-01',
        action: ControllerAction.APPROVE,
        controllerId: engUserId,
        reason: 'Approved track slot 1',
      },
      {
        decisionId: 'DEC-HIST-02',
        requestId: 'REQ-HIST-02',
        brainRunId: 'RUN-HIST-02',
        action: ControllerAction.REJECT,
        controllerId: engUserId,
        reason: 'Rejected due to express conflict',
      },
      {
        decisionId: 'DEC-HIST-03',
        requestId: 'REQ-HIST-03',
        brainRunId: 'RUN-HIST-03',
        action: ControllerAction.MODIFY,
        controllerId: engUserId,
        reason: 'Modified duration',
      },
    ]);


    // 2. Query page 1 with limit 2
    const resPage1 = await request(app)
      .get('/api/v1/controller/history?page=1&limit=2')
      .set('Authorization', `Bearer ${controllerToken}`);

    expect(resPage1.status).toBe(200);
    expect(resPage1.body.data.decisions).toHaveLength(2);
    expect(resPage1.body.data.pagination).toEqual({
      page: 1,
      limit: 2,
      total: 3,
      totalPages: 2,
      hasNextPage: true,
      hasPreviousPage: false,
    });

    // 3. Query page 2 with limit 2
    const resPage2 = await request(app)
      .get('/api/v1/controller/history?page=2&limit=2')
      .set('Authorization', `Bearer ${controllerToken}`);

    expect(resPage2.status).toBe(200);
    expect(resPage2.body.data.decisions).toHaveLength(1);
    expect(resPage2.body.data.pagination).toEqual({
      page: 2,
      limit: 2,
      total: 3,
      totalPages: 2,
      hasNextPage: false,
      hasPreviousPage: true,
    });

    // 4. Invalid pagination bounds
    const invalidPage = await request(app)
      .get('/api/v1/controller/history?page=0')
      .set('Authorization', `Bearer ${controllerToken}`);
    expect(invalidPage.status).toBe(400);
    expect(invalidPage.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);

    const invalidLimit = await request(app)
      .get('/api/v1/controller/history?limit=-5')
      .set('Authorization', `Bearer ${controllerToken}`);
    expect(invalidLimit.status).toBe(400);
    expect(invalidLimit.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);

    const excessiveLimit = await request(app)
      .get('/api/v1/controller/history?limit=9999')
      .set('Authorization', `Bearer ${controllerToken}`);
    expect(excessiveLimit.status).toBe(400);
    expect(excessiveLimit.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);

    const notANumber = await request(app)
      .get('/api/v1/controller/history?page=abc')
      .set('Authorization', `Bearer ${controllerToken}`);
    expect(notANumber.status).toBe(400);
    expect(notANumber.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
  });
});

