import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/server/app';
import { User } from '../src/server/models/User';
import { AuditLog } from '../src/server/models/AuditLog';
import { Role, Department, AuditAction } from '../src/server/config/constants';
import { logAudit } from '../src/server/services/auditService';

describe('Audit Trail System', () => {
  let controllerToken: string;
  let engToken: string;
  let userId: string;

  beforeEach(async () => {
    await User.deleteMany({});
    await AuditLog.deleteMany({});

    // Register Controller
    const ctrlRes = await request(app).post('/api/v1/auth/controller/register').send({
      name: 'Auditor Controller',
      email: 'auditctrl@railway.gov.in',
      controllerId: 'Aud@01',
      password: 'Password123!',
      confirmPassword: 'Password123!',
    });
    controllerToken = ctrlRes.body.data.token;
    userId = ctrlRes.body.data.user.id;


    // Register Engineer
    const engRes = await request(app).post('/api/v1/auth/register').send({
      name: 'Audit Engineer',
      email: 'auditeng@railway.gov.in',
      password: 'Password123!',
      role: Role.MAINTENANCE_ENGINEERING,
      department: Department.ENGINEERING,
    });
    engToken = engRes.body.data.token;
  });

  it('should persist immutable audit log entries via auditService', async () => {
    await logAudit({
      actorId: userId,
      actorRole: Role.CONTROLLER,
      action: AuditAction.REQUEST_APPROVED,
      entityId: 'REQ-AUDIT-001',
      planningVersion: 3,
      newState: { status: 'APPROVED' },
    });

    const logs = await AuditLog.find({ entityId: 'REQ-AUDIT-001' });
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe(AuditAction.REQUEST_APPROVED);
    expect(logs[0].planningVersion).toBe(3);
    expect(logs[0].actorRole).toBe(Role.CONTROLLER);
  });

  it('should allow Controller to query audit logs through API', async () => {
    await logAudit({
      actorId: userId,
      actorRole: Role.CONTROLLER,
      action: AuditAction.REQUEST_APPROVED,
      entityId: 'REQ-AUDIT-002',
    });

    const res = await request(app)
      .get('/api/v1/audit?entityId=REQ-AUDIT-002')
      .set('Authorization', `Bearer ${controllerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.logs).toHaveLength(1);
    expect(res.body.data.logs[0].entityId).toBe('REQ-AUDIT-002');
  });

  it('should forbid maintenance engineer from querying audit logs (403 FORBIDDEN)', async () => {
    const res = await request(app)
      .get('/api/v1/audit')
      .set('Authorization', `Bearer ${engToken}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });
});
