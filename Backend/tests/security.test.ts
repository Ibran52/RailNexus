import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { app } from '../src/server/app';
import { User } from '../src/server/models/User';
import { MaintenanceRequest } from '../src/server/models/MaintenanceRequest';
import { BrainRun } from '../src/server/models/BrainRun';
import {
  Role,
  Department,
  RequestStatus,
  RequestPriority,
  ErrorCode,
} from '../src/server/config/constants';
import { brainClient } from '../src/server/services/brainClient';
import { BrainAnalyzeResponse } from '../src/server/types';

describe('Production Hardening & Security Test Suite', () => {
  const mockBrainResponse: BrainAnalyzeResponse = {
    success: true,
    request_id: 'REQ-SEC-001',
    recommendation: {
      start: '2026-09-10T02:00:00.000Z',
      end: '2026-09-10T04:00:00.000Z',
      impact_score: 15.0,
    },
    metrics: {
      impact_score: 15.0,
    },
    conflicts: [],
    alternatives: [],
  };

  beforeEach(async () => {
    await User.deleteMany({});
    await MaintenanceRequest.deleteMany({});
    await BrainRun.deleteMany({});
    vi.spyOn(brainClient, 'analyzeMaintenanceWindow').mockResolvedValue(mockBrainResponse);
  });

  // P0-1: Block CONTROLLER role from /auth/register (Privilege Escalation Prevention)
  it('P0-1: should reject CONTROLLER role registration via /auth/register', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      name: 'Attacker Controller',
      email: 'attacker@railway.gov.in',
      password: 'Password123!',
      role: Role.CONTROLLER,
      department: Department.CONTROLLER,
    });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe(ErrorCode.INVALID_ROLE);

    // Verify user was NOT created
    const user = await User.findOne({ email: 'attacker@railway.gov.in' });
    expect(user).toBeNull();
  });

  // P0-1: Block ADMIN role from /auth/register
  it('P0-1: should reject ADMIN role registration via /auth/register', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      name: 'Attacker Admin',
      email: 'admin.attacker@railway.gov.in',
      password: 'Password123!',
      role: Role.ADMIN,
      department: Department.ENGINEERING,
    });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe(ErrorCode.INVALID_ROLE);

    const user = await User.findOne({ email: 'admin.attacker@railway.gov.in' });
    expect(user).toBeNull();
  });

  // P0-2 & P1-8: Mass assignment immutability on PATCH /auth/me
  it('P0-2 & P1-8: should prevent mass-assignment privilege escalation on PATCH /auth/me', async () => {
    // 1. Register worker
    const regRes = await request(app).post('/api/v1/auth/register').send({
      name: 'Honest Worker',
      email: 'worker@railway.gov.in',
      password: 'Password123!',
      role: Role.MAINTENANCE_ENGINEERING,
      department: Department.ENGINEERING,
    });
    const token = regRes.body.data.token;

    // 2. Attempt to update immutable fields via PATCH /auth/me
    const patchRes = await request(app)
      .patch('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Honest Worker Renamed',
        role: Role.CONTROLLER,
        department: Department.CONTROLLER,
        controllerId: 'A@b123',
        isActive: false,
      });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.data.name).toBe('Honest Worker Renamed');

    // 3. Verify in MongoDB that role/department/controllerId/isActive remained uncorrupted
    const dbUser = await User.findOne({ email: 'worker@railway.gov.in' });
    expect(dbUser).not.toBeNull();
    expect(dbUser!.name).toBe('Honest Worker Renamed');
    expect(dbUser!.role).toBe(Role.MAINTENANCE_ENGINEERING);
    expect(dbUser!.department).toBe(Department.ENGINEERING);
    expect(dbUser!.controllerId).toBeUndefined();
    expect(dbUser!.isActive).toBe(true);
  });

  // P0-3: Idempotency user ownership binding
  it('P0-3: should reject replay of another user idempotency key with 403 IDEMPOTENCY_KEY_OWNERSHIP_VIOLATION', async () => {
    // Register User A
    const userARes = await request(app).post('/api/v1/auth/register').send({
      name: 'User A',
      email: 'usera@railway.gov.in',
      password: 'Password123!',
      role: Role.MAINTENANCE_ENGINEERING,
      department: Department.ENGINEERING,
    });
    const tokenA = userARes.body.data.token;

    // Register User B
    const userBRes = await request(app).post('/api/v1/auth/register').send({
      name: 'User B',
      email: 'userb@railway.gov.in',
      password: 'Password123!',
      role: Role.MAINTENANCE_SNT,
      department: Department.SNT,
    });
    const tokenB = userBRes.body.data.token;

    const idempotencyKey = 'SEC-IDEMP-KEY-999';

    // User A creates request with the key
    const createResA = await request(app)
      .post('/api/v1/maintenance/requests')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        maintenanceType: 'RAIL_REPLACEMENT',
        fromStation: 'NDLS',
        toStation: 'GZB',
        durationMinutes: 120,
        earliestStart: '2026-09-10T00:00:00.000Z',
        latestEnd: '2026-09-10T06:00:00.000Z',
        priority: RequestPriority.MEDIUM,
      });

    expect(createResA.status).toBe(201);
    expect(createResA.body.data.request.requestId).toBeDefined();

    // User B attempts to use User A's idempotency key
    const createResB = await request(app)
      .post('/api/v1/maintenance/requests')
      .set('Authorization', `Bearer ${tokenB}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        maintenanceType: 'SIGNAL_CHECK',
        fromStation: 'CNB',
        toStation: 'PRYJ',
        durationMinutes: 180,
        earliestStart: '2026-09-11T00:00:00.000Z',
        latestEnd: '2026-09-11T06:00:00.000Z',
        priority: RequestPriority.HIGH,
      });

    expect(createResB.status).toBe(403);
    expect(createResB.body.success).toBe(false);
    expect(createResB.body.error.code).toBe(ErrorCode.IDEMPOTENCY_KEY_OWNERSHIP_VIOLATION);

    // User A replays the key -> succeeds with 200 idempotent replay
    const replayResA = await request(app)
      .post('/api/v1/maintenance/requests')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        maintenanceType: 'RAIL_REPLACEMENT',
        fromStation: 'NDLS',
        toStation: 'GZB',
        durationMinutes: 120,
        earliestStart: '2026-09-10T00:00:00.000Z',
        latestEnd: '2026-09-10T06:00:00.000Z',
        priority: RequestPriority.MEDIUM,
      });

    expect(replayResA.status).toBe(200);
    expect(replayResA.body.data.isDuplicate).toBe(true);
    expect(replayResA.body.data.request.requestId).toBe(createResA.body.data.request.requestId);
  });

  // P0-4: In-flight same-key idempotency test (ANALYZING status without BrainRun)
  it('P0-4: should handle in-flight idempotency replay when request is ANALYZING without brainRun', async () => {
    // Register User A
    const userARes = await request(app).post('/api/v1/auth/register').send({
      name: 'User Inflight',
      email: 'inflight@railway.gov.in',
      password: 'Password123!',
      role: Role.MAINTENANCE_ENGINEERING,
      department: Department.ENGINEERING,
    });
    const tokenA = userARes.body.data.token;
    const userIdA = userARes.body.data.user.id;

    const inFlightKey = 'INFLIGHT-KEY-001';

    // Seed request in ANALYZING status with no currentBrainRunId
    await MaintenanceRequest.create({
      requestId: 'REQ-INFLIGHT-99',
      idempotencyKey: inFlightKey,
      maintenanceType: 'TRACK_GEOMETRY',
      fromStation: 'NDLS',
      toStation: 'GZB',
      priority: RequestPriority.HIGH,
      earliestStart: new Date('2026-09-10T06:00:00.000Z'),
      latestEnd: new Date('2026-09-10T12:00:00.000Z'),
      durationMinutes: 120,
      department: Department.ENGINEERING,
      status: RequestStatus.ANALYZING,
      createdBy: userIdA,
      planningVersion: 1,
      currentBrainRunId: undefined,
    });

    // Client retries with same idempotency key while in-flight
    const retryRes = await request(app)
      .post('/api/v1/maintenance/requests')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('Idempotency-Key', inFlightKey)
      .send({
        maintenanceType: 'TRACK_GEOMETRY',
        fromStation: 'NDLS',
        toStation: 'GZB',
        durationMinutes: 120,
        earliestStart: '2026-09-10T06:00:00.000Z',
        latestEnd: '2026-09-10T12:00:00.000Z',
        priority: RequestPriority.HIGH,
      });

    expect(retryRes.status).toBe(200);
    expect(retryRes.body.success).toBe(true);
    expect(retryRes.body.data.isDuplicate).toBe(true);
    expect(retryRes.body.data.request.requestId).toBe('REQ-INFLIGHT-99');
    expect(retryRes.body.data.request.status).toBe(RequestStatus.ANALYZING);
    expect(retryRes.body.data.brainRun).toBeUndefined();

    // Verify DB count has exactly 1 document
    const count = await MaintenanceRequest.countDocuments({ idempotencyKey: inFlightKey });
    expect(count).toBe(1);
  });

  // P0-5: Concurrent duplicate email creation test
  it('P0-5: should allow exactly one user creation on concurrent duplicate email registration', async () => {
    const duplicateEmail = 'concurrent.dup@railway.gov.in';

    const [r1, r2] = await Promise.all([
      request(app).post('/api/v1/auth/register').send({
        name: 'Concurrent User 1',
        email: duplicateEmail,
        password: 'Password123!',
        role: Role.MAINTENANCE_ENGINEERING,
        department: Department.ENGINEERING,
      }),
      request(app).post('/api/v1/auth/register').send({
        name: 'Concurrent User 2',
        email: duplicateEmail,
        password: 'Password123!',
        role: Role.MAINTENANCE_ENGINEERING,
        department: Department.ENGINEERING,
      }),
    ]);

    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([201, 409]);

    const conflictRes = r1.status === 409 ? r1 : r2;
    expect(conflictRes.body.error.code).toBe(ErrorCode.EMAIL_EXISTS);

    // Verify only 1 document in MongoDB
    const userCount = await User.countDocuments({ email: duplicateEmail });
    expect(userCount).toBe(1);
  });

  // P0-6: Idempotency same-key / different-payload test
  it('P0-6: should return original request and ignore payload on same idempotency key', async () => {
    const userRes = await request(app).post('/api/v1/auth/register').send({
      name: 'User Idemp',
      email: 'idemp@railway.gov.in',
      password: 'Password123!',
      role: Role.MAINTENANCE_ENGINEERING,
      department: Department.ENGINEERING,
    });
    const token = userRes.body.data.token;

    const idempotencyKey = 'DIFF-PAYLOAD-KEY-42';

    // 1. Initial request: NDLS -> GZB
    const firstRes = await request(app)
      .post('/api/v1/maintenance/requests')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        maintenanceType: 'RAIL_GRINDING',
        fromStation: 'NDLS',
        toStation: 'GZB',
        durationMinutes: 120,
        earliestStart: '2026-09-10T00:00:00.000Z',
        latestEnd: '2026-09-10T06:00:00.000Z',
        priority: RequestPriority.MEDIUM,
      });

    expect(firstRes.status).toBe(201);
    expect(firstRes.body.data.request.fromStation).toBe('NDLS');

    // 2. Second request with same key but completely different stations/types
    const secondRes = await request(app)
      .post('/api/v1/maintenance/requests')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        maintenanceType: 'MAJOR_BRIDGE',
        fromStation: 'ALLAHABAD',
        toStation: 'PUNE',
        durationMinutes: 360,
        earliestStart: '2026-09-20T00:00:00.000Z',
        latestEnd: '2026-09-20T12:00:00.000Z',
        priority: RequestPriority.CRITICAL,
      });

    expect(secondRes.status).toBe(200);
    expect(secondRes.body.data.isDuplicate).toBe(true);
    // Returns the original request data, NOT the mutated second payload
    expect(secondRes.body.data.request.fromStation).toBe('NDLS');
    expect(secondRes.body.data.request.toStation).toBe('GZB');
    expect(secondRes.body.data.request.maintenanceType).toBe('RAIL_GRINDING');

    // Verify DB has only 1 record
    const count = await MaintenanceRequest.countDocuments({ idempotencyKey });
    expect(count).toBe(1);
  });

  // P0-7: Other / custom department end-to-end compatibility audit
  it('P0-7: should properly handle custom department workflow and isolation', async () => {
    // 1. Register worker with custom department
    const customDeptRes = await request(app).post('/api/v1/auth/register').send({
      name: 'Custom Planner',
      email: 'custom.dept@railway.gov.in',
      password: 'Password123!',
      role: Role.MAINTENANCE_ENGINEERING,
      department: 'Signalling Planning',
      departmentType: 'OTHER',
    });
    expect(customDeptRes.status).toBe(201);
    const customToken = customDeptRes.body.data.token;

    // 2. Register standard engineering worker
    const engRes = await request(app).post('/api/v1/auth/register').send({
      name: 'Standard Eng',
      email: 'std.eng@railway.gov.in',
      password: 'Password123!',
      role: Role.MAINTENANCE_ENGINEERING,
      department: Department.ENGINEERING,
    });
    const engToken = engRes.body.data.token;

    // 3. Register Controller
    const ctrlRes = await request(app).post('/api/v1/auth/controller/register').send({
      name: 'Auditor Controller',
      email: 'audit.ctrl@railway.gov.in',
      controllerId: 'Aud@01',
      password: 'Password123!',
      confirmPassword: 'Password123!',
    });
    const ctrlToken = ctrlRes.body.data.token;

    // 4. Custom worker creates request
    const createRes = await request(app)
      .post('/api/v1/maintenance/requests')
      .set('Authorization', `Bearer ${customToken}`)
      .send({
        maintenanceType: 'CUSTOM_SURVEY',
        fromStation: 'NDLS',
        toStation: 'TKJ',
        durationMinutes: 120,
        earliestStart: '2026-09-12T00:00:00.000Z',
        latestEnd: '2026-09-12T06:00:00.000Z',
        priority: RequestPriority.MEDIUM,
      });
    expect(createRes.status).toBe(201);
    expect(createRes.body.data.request.department).toBe('Signalling Planning');

    // 5. Custom worker gets requests -> sees own request
    const customGet = await request(app)
      .get('/api/v1/maintenance/requests')
      .set('Authorization', `Bearer ${customToken}`);
    expect(customGet.status).toBe(200);
    expect(customGet.body.data.requests.length).toBe(1);
    expect(customGet.body.data.requests[0].department).toBe('Signalling Planning');

    // 6. Standard engineering worker gets requests -> does NOT see custom request
    const engGet = await request(app)
      .get('/api/v1/maintenance/requests')
      .set('Authorization', `Bearer ${engToken}`);
    expect(engGet.status).toBe(200);
    expect(engGet.body.data.requests.length).toBe(0);


    // 7. Controller gets all requests -> sees custom department request
    const ctrlGet = await request(app)
      .get('/api/v1/controller/requests')
      .set('Authorization', `Bearer ${ctrlToken}`);
    expect(ctrlGet.status).toBe(200);
    const found = ctrlGet.body.data.find(
      (r: any) => r.department === 'Signalling Planning'
    );
    expect(found).toBeDefined();
  });
});
