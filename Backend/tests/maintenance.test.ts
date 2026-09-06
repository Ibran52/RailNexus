import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { app } from '../src/server/app';
import { User } from '../src/server/models/User';
import { MaintenanceRequest } from '../src/server/models/MaintenanceRequest';
import { BrainRun } from '../src/server/models/BrainRun';
import { AuditLog } from '../src/server/models/AuditLog';
import {
  Role,
  Department,
  RequestStatus,
  RequestPriority,
  AuditAction,
  ErrorCode,
} from '../src/server/config/constants';
import { brainClient } from '../src/server/services/brainClient';
import { BrainAnalyzeResponse } from '../src/server/types';
import * as eventService from '../src/server/services/eventService';

describe('Maintenance Request Lifecycle & Ownership', () => {
  let engToken: string;
  let engUserId: string;
  let sntToken: string;
  let controllerToken: string;

  beforeEach(async () => {
    await User.deleteMany({});
    await MaintenanceRequest.deleteMany({});
    await BrainRun.deleteMany({});

    // Register Engineering User
    const engRes = await request(app).post('/api/v1/auth/register').send({
      name: 'Eng User',
      email: 'eng@railway.gov.in',
      password: 'Password123!',
      role: Role.MAINTENANCE_ENGINEERING,
      department: Department.ENGINEERING,
    });
    engToken = engRes.body.data.token;
    engUserId = engRes.body.data.user.id;

    // Register SNT User
    const sntRes = await request(app).post('/api/v1/auth/register').send({
      name: 'SNT User',
      email: 'snt@railway.gov.in',
      password: 'Password123!',
      role: Role.MAINTENANCE_SNT,
      department: Department.SNT,
    });
    sntToken = sntRes.body.data.token;

    // Register Controller
    const ctrlRes = await request(app).post('/api/v1/auth/controller/register').send({
      name: 'Chief Controller',
      email: 'controller@railway.gov.in',
      controllerId: 'Chf@12',
      password: 'Password123!',
      confirmPassword: 'Password123!',
    });
    controllerToken = ctrlRes.body.data.token;
  });

  it('should validate and create maintenance request, call Brain, and set status to RECOMMENDED', async () => {
    const mockBrainResponse: BrainAnalyzeResponse = {
      success: true,
      request_id: 'REQ-MOCK-001',
      recommendation: {
        start: '2026-09-05T07:00:00.000Z',
        end: '2026-09-05T09:00:00.000Z',
        impact_score: 22.0,
      },
      metrics: {
        total_cascade_delay_minutes: 10,
        total_trains_delayed: 1,
        impact_score: 22.0,
      },
      conflicts: [],
      alternatives: [],
    };

    vi.spyOn(brainClient, 'analyzeMaintenanceWindow').mockResolvedValueOnce(mockBrainResponse);

    const res = await request(app)
      .post('/api/v1/maintenance')
      .set('Authorization', `Bearer ${engToken}`)
      .send({
        maintenanceType: 'TRACK_TAMPING',
        fromStation: 'NDLS',
        toStation: 'GZB',
        durationMinutes: 120,
        earliestStart: '2026-09-05T06:00:00.000Z',
        latestEnd: '2026-09-05T12:00:00.000Z',
        priority: RequestPriority.HIGH,
        description: 'Scheduled track tamping on Down Main line',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.request.status).toBe(RequestStatus.RECOMMENDED);
    expect(res.body.data.request.department).toBe(Department.ENGINEERING);
    expect(res.body.data.brainRun).toBeDefined();

    // Verify persisted in DB
    const savedReq = await MaintenanceRequest.findOne({ requestId: res.body.data.request.requestId });
    expect(savedReq).toBeDefined();
    expect(savedReq?.status).toBe(RequestStatus.RECOMMENDED);
  });

  it('should reject maintenance request when earliestStart >= latestEnd', async () => {
    const res = await request(app)
      .post('/api/v1/maintenance')
      .set('Authorization', `Bearer ${engToken}`)
      .send({
        maintenanceType: 'TRACK_TAMPING',
        fromStation: 'NDLS',
        toStation: 'GZB',
        durationMinutes: 120,
        earliestStart: '2026-09-05T12:00:00.000Z',
        latestEnd: '2026-09-05T06:00:00.000Z',
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('should reject maintenance request creation by controller (only maintenance engineers can create)', async () => {
    const res = await request(app)
      .post('/api/v1/maintenance')
      .set('Authorization', `Bearer ${controllerToken}`)
      .send({
        maintenanceType: 'TRACK_TAMPING',
        fromStation: 'NDLS',
        toStation: 'GZB',
        durationMinutes: 120,
        earliestStart: '2026-09-05T06:00:00.000Z',
        latestEnd: '2026-09-05T12:00:00.000Z',
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('should deduplicate request with Idempotency-Key', async () => {
    const mockBrainResponse: BrainAnalyzeResponse = {
      success: true,
      request_id: 'REQ-IDEM-001',
      recommendation: {
        start: '2026-09-05T07:00:00.000Z',
        end: '2026-09-05T09:00:00.000Z',
        impact_score: 15.0,
      },
      metrics: { impact_score: 15.0 },
      conflicts: [],
      alternatives: [],
    };
    vi.spyOn(brainClient, 'analyzeMaintenanceWindow').mockResolvedValueOnce(mockBrainResponse);

    const idempotencyKey = 'idem-unique-key-12345';

    // First call
    const res1 = await request(app)
      .post('/api/v1/maintenance')
      .set('Authorization', `Bearer ${engToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        maintenanceType: 'TRACK_TAMPING',
        fromStation: 'NDLS',
        toStation: 'GZB',
        durationMinutes: 60,
        earliestStart: '2026-09-05T06:00:00.000Z',
        latestEnd: '2026-09-05T10:00:00.000Z',
      });

    expect(res1.status).toBe(201);
    const reqId1 = res1.body.data.request.requestId;

    // Duplicate call with same Idempotency-Key
    const res2 = await request(app)
      .post('/api/v1/maintenance')
      .set('Authorization', `Bearer ${engToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        maintenanceType: 'TRACK_TAMPING',
        fromStation: 'NDLS',
        toStation: 'GZB',
        durationMinutes: 60,
        earliestStart: '2026-09-05T06:00:00.000Z',
        latestEnd: '2026-09-05T10:00:00.000Z',
      });

    expect(res2.status).toBe(200);
    expect(res2.body.data.request.requestId).toBe(reqId1);
  });

  it('should filter requests by department for department users, but show all to controller', async () => {
    // Create an ENG request
    await MaintenanceRequest.create({
      requestId: 'REQ-ENG-001',
      createdBy: engUserId,
      department: Department.ENGINEERING,
      maintenanceType: 'TRACK_TAMPING',
      fromStation: 'NDLS',
      toStation: 'GZB',
      durationMinutes: 60,
      earliestStart: new Date('2026-09-05T06:00:00Z'),
      latestEnd: new Date('2026-09-05T10:00:00Z'),
      priority: RequestPriority.MEDIUM,
      status: RequestStatus.RECOMMENDED,
    });

    // Create an SNT request
    await MaintenanceRequest.create({
      requestId: 'REQ-SNT-001',
      createdBy: engUserId,
      department: Department.SNT,
      maintenanceType: 'POINT_MACHINE_OVERHAUL',
      fromStation: 'GZB',
      toStation: 'ALJN',
      durationMinutes: 90,
      earliestStart: new Date('2026-09-05T07:00:00Z'),
      latestEnd: new Date('2026-09-05T11:00:00Z'),
      priority: RequestPriority.HIGH,
      status: RequestStatus.RECOMMENDED,
    });

    // SNT user listing
    const sntListRes = await request(app)
      .get('/api/v1/maintenance')
      .set('Authorization', `Bearer ${sntToken}`);
    expect(sntListRes.status).toBe(200);
    expect(sntListRes.body.data.requests).toHaveLength(1);
    expect(sntListRes.body.data.requests[0].department).toBe(Department.SNT);

    // Controller uses /controller/requests endpoint
    const ctrlListRes = await request(app)
      .get('/api/v1/controller/requests')
      .set('Authorization', `Bearer ${controllerToken}`);
    expect(ctrlListRes.status).toBe(200);
    expect(ctrlListRes.body.data).toHaveLength(2);
  });

  it('should halt success path and return 409 STALE_PLAN if final ANALYZING -> RECOMMENDED transition fails', async () => {
    const emitSpy = vi.spyOn(eventService, 'emitControllerEvent');
    emitSpy.mockClear();

    const mockBrainResponse: BrainAnalyzeResponse = {
      success: true,
      brain_run_id: 'RUN-CREATE-FAIL-01',
      request_id: 'REQ-CREATE-FAIL-01',
      status: 'RECOMMENDED',
      recommendation: {
        start: '2026-09-05T08:00:00.000Z',
        end: '2026-09-05T10:00:00.000Z',
        impact_score: 25.0,
      },
      metrics: {
        total_cascade_delay_minutes: 0,
        total_trains_delayed: 0,
        impact_score: 25.0,
      },
      conflicts: [],
      alternatives: [],
    };

    // When Brain microservice finishes analysis, simulate a concurrent modification
    // so the final conditional update ({ requestId, status: ANALYZING, planningVersion }) matches 0 documents
    vi.spyOn(brainClient, 'analyzeMaintenanceWindow').mockImplementationOnce(async (payload) => {
      await MaintenanceRequest.updateOne(
        { requestId: payload.request_id },
        { $set: { status: RequestStatus.CANCELLED } }
      );
      return {
        ...mockBrainResponse,
        request_id: payload.request_id,
      };
    });

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

    // 1. Must fail with 409 STALE_PLAN
    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe(ErrorCode.STALE_PLAN);

    // 2. NO successful REQUEST_RECOMMENDED audit log created
    const audits = await AuditLog.find({
      action: AuditAction.REQUEST_RECOMMENDED,
    });
    expect(audits).toHaveLength(0);

    // 3. NO REQUEST_RECOMMENDED SSE event emitted
    const sseCalls = emitSpy.mock.calls.filter(([event]) => event === 'REQUEST_RECOMMENDED');
    expect(sseCalls).toHaveLength(0);

    // 4. BrainRun remains historical
    const persistedBrainRun = await BrainRun.findOne({ brainRunId: 'RUN-CREATE-FAIL-01' });
    expect(persistedBrainRun).not.toBeNull();

    // 5. Request in DB is NOT falsely marked as RECOMMENDED
    const savedReq = await MaintenanceRequest.findOne({ fromStation: 'NDLS', toStation: 'GZB' });
    expect(savedReq?.status).toBe(RequestStatus.CANCELLED);
    expect(savedReq?.currentBrainRunId).toBeUndefined();
  });

  // P1-3: OHE Full Auth + Department Isolation Suite
  it('P1-3: should verify OHE department auth, request creation, and cross-department isolation', async () => {
    // 1. OHE user registration & login
    const oheReg = await request(app).post('/api/v1/auth/register').send({
      name: 'OHE Tech Rajesh',
      email: 'rajesh.ohe@railway.gov.in',
      password: 'Password123!',
      role: Role.MAINTENANCE_OHE,
      department: Department.OHE,
    });
    expect(oheReg.status).toBe(201);
    const oheToken = oheReg.body.data.token;

    // Verify /me endpoint
    const meRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${oheToken}`);
    expect(meRes.status).toBe(200);
    expect(meRes.body.data.role).toBe(Role.MAINTENANCE_OHE);
    expect(meRes.body.data.department).toBe(Department.OHE);

    // 2. Mock Brain and create OHE maintenance request
    const mockBrainResponse: BrainAnalyzeResponse = {
      success: true,
      request_id: 'REQ-OHE-001',
      recommendation: {
        start: '2026-09-15T01:00:00.000Z',
        end: '2026-09-15T03:00:00.000Z',
        impact_score: 22.0,
      },
      metrics: {
        impact_score: 22.0,
      },
      conflicts: [],
      alternatives: [],
    };
    vi.spyOn(brainClient, 'analyzeMaintenanceWindow').mockResolvedValue(mockBrainResponse);

    const createRes = await request(app)
      .post('/api/v1/maintenance/requests')
      .set('Authorization', `Bearer ${oheToken}`)
      .send({
        maintenanceType: 'OHE_INSPECTION',
        fromStation: 'NDLS',
        toStation: 'CNB',
        durationMinutes: 120,
        earliestStart: '2026-09-15T00:00:00.000Z',
        latestEnd: '2026-09-15T06:00:00.000Z',
        priority: RequestPriority.HIGH,
        description: 'Overhead Catenary Maintenance',
      });


    expect(createRes.status).toBe(201);
    expect(createRes.body.data.request.department).toBe(Department.OHE);
    expect(createRes.body.data.request.status).toBe(RequestStatus.RECOMMENDED);
    const oheRequestId = createRes.body.data.request.requestId;

    // 3. OHE GET /maintenance/requests -> sees only OHE request
    const oheListRes = await request(app)
      .get('/api/v1/maintenance/requests')
      .set('Authorization', `Bearer ${oheToken}`);
    expect(oheListRes.status).toBe(200);
    expect(oheListRes.body.data.requests).toHaveLength(1);
    expect(oheListRes.body.data.requests[0].requestId).toBe(oheRequestId);

    // 4. Engineering GET /maintenance/requests -> does NOT see OHE request
    const engListRes = await request(app)
      .get('/api/v1/maintenance/requests')
      .set('Authorization', `Bearer ${engToken}`);
    expect(engListRes.status).toBe(200);
    const hasOheInEng = engListRes.body.data.requests.some((r: any) => r.requestId === oheRequestId);
    expect(hasOheInEng).toBe(false);

    // 5. S&T GET /maintenance/requests -> does NOT see OHE request
    const sntListRes = await request(app)
      .get('/api/v1/maintenance/requests')
      .set('Authorization', `Bearer ${sntToken}`);
    expect(sntListRes.status).toBe(200);
    const hasOheInSnt = sntListRes.body.data.requests.some((r: any) => r.requestId === oheRequestId);
    expect(hasOheInSnt).toBe(false);


    // 6. Controller GET /controller/requests -> sees all requests including OHE
    const ctrlListRes = await request(app)
      .get('/api/v1/controller/requests')
      .set('Authorization', `Bearer ${controllerToken}`);
    expect(ctrlListRes.status).toBe(200);
    const foundOheInCtrl = ctrlListRes.body.data.some((r: any) => r.requestId === oheRequestId);
    expect(foundOheInCtrl).toBe(true);

    // 7. OHE worker can view own request details by ID
    const oheDetailRes = await request(app)
      .get(`/api/v1/maintenance/requests/${oheRequestId}`)
      .set('Authorization', `Bearer ${oheToken}`);
    expect(oheDetailRes.status).toBe(200);
    expect(oheDetailRes.body.data.request.requestId).toBe(oheRequestId);

    // 8. Engineering worker attempting to fetch OHE request by ID is rejected with 403 FORBIDDEN
    const engDetailRes = await request(app)
      .get(`/api/v1/maintenance/requests/${oheRequestId}`)
      .set('Authorization', `Bearer ${engToken}`);
    expect(engDetailRes.status).toBe(403);
    expect(engDetailRes.body.success).toBe(false);
    expect(engDetailRes.body.error.code).toBe(ErrorCode.FORBIDDEN);
  });

  it('P0-RBAC: rejects controller from maintenance worker routes with 403 FORBIDDEN', async () => {
    // Controller must use /controller endpoints, not /maintenance endpoints
    const res = await request(app)
      .get('/api/v1/maintenance/requests')
      .set('Authorization', `Bearer ${controllerToken}`);
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe(ErrorCode.FORBIDDEN);

    const postRes = await request(app)
      .post('/api/v1/maintenance/requests')
      .set('Authorization', `Bearer ${controllerToken}`)
      .send({
        maintenanceType: 'Track Renewal',
        fromStation: 'TNA',
        toStation: 'KYN',
        durationMinutes: 120,
        earliestStart: new Date().toISOString(),
        latestEnd: new Date(Date.now() + 3600000).toISOString(),
        priority: RequestPriority.MEDIUM,
      });
    expect(postRes.status).toBe(403);
  });
});

