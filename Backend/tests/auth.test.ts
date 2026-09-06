import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/server/app';
import { User } from '../src/server/models/User';
import { Role, Department, ErrorCode } from '../src/server/config/constants';


describe('Auth & Authorization Suite', () => {
  beforeEach(async () => {
    await User.deleteMany({});
  });

  it('should successfully register a department engineer', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Track Engineer Alice',
        email: 'alice@railway.gov.in',
        password: 'Password123!',
        role: Role.MAINTENANCE_ENGINEERING,
        department: Department.ENGINEERING,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe('alice@railway.gov.in');
    expect(res.body.data.user.role).toBe(Role.MAINTENANCE_ENGINEERING);
    expect(res.body.data.user.department).toBe(Department.ENGINEERING);
    expect(res.body.data.token).toBeDefined();

    // Verify password is not exposed
    expect(res.body.data.user.passwordHash).toBeUndefined();
    expect(res.body.data.user.password).toBeUndefined();
  });

  it('should reject registration with duplicate email', async () => {
    await request(app).post('/api/v1/auth/register').send({
      name: 'User One',
      email: 'duplicate@railway.gov.in',
      password: 'Password123!',
      role: Role.MAINTENANCE_OHE,
      department: Department.OHE,
    });

    const res = await request(app).post('/api/v1/auth/register').send({
      name: 'User Two',
      email: 'duplicate@railway.gov.in',
      password: 'Password123!',
      role: Role.MAINTENANCE_ENGINEERING,
      department: Department.ENGINEERING,
    });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe(ErrorCode.EMAIL_EXISTS);
  });

  it('should reject registration if department engineer has no department', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      name: 'Invalid Engineer',
      email: 'invalid@railway.gov.in',
      password: 'Password123!',
      role: Role.MAINTENANCE_ENGINEERING,
    });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('should authenticate user with valid credentials and reject invalid password', async () => {
    await request(app).post('/api/v1/auth/register').send({
      name: 'Worker Bob',
      email: 'bob@railway.gov.in',
      password: 'SecurePassword123!',
      role: Role.MAINTENANCE_ENGINEERING,
      department: Department.ENGINEERING,
    });

    // Valid login
    const validRes = await request(app).post('/api/v1/auth/login').send({
      email: 'bob@railway.gov.in',
      password: 'SecurePassword123!',
    });

    expect(validRes.status).toBe(200);
    expect(validRes.body.success).toBe(true);
    expect(validRes.body.data.token).toBeDefined();
    expect(validRes.body.data.user.role).toBe(Role.MAINTENANCE_ENGINEERING);


    // Invalid login
    const invalidRes = await request(app).post('/api/v1/auth/login').send({
      email: 'bob@railway.gov.in',
      password: 'WrongPassword!',
    });

    expect(invalidRes.status).toBe(401);
    expect(invalidRes.body.success).toBe(false);
  });

  it('should verify /me route with JWT and reject unauthorized access', async () => {
    const regRes = await request(app).post('/api/v1/auth/register').send({
      name: 'Signaling Tech',
      email: 'sig@railway.gov.in',
      password: 'Password123!',
      role: Role.MAINTENANCE_SNT,
      department: Department.SNT,
    });

    const token = regRes.body.data.token;

    // Authorized
    const meRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.data.email).toBe('sig@railway.gov.in');

    // Missing token
    const noTokenRes = await request(app).get('/api/v1/auth/me');
    expect(noTokenRes.status).toBe(401);

    // Invalid token
    const badTokenRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer invalid_garbage_token');
    expect(badTokenRes.status).toBe(401);
  });
});
