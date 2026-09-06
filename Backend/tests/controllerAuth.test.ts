import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/server/app';
import { User } from '../src/server/models/User';
import { Role, Department } from '../src/server/config/constants';

describe('Controller Authentication & Identification Suite', () => {
  beforeEach(async () => {
    await User.deleteMany({});
  });

  // TEST 1: Controller registration with valid ID: A@b123 -> success
  it('TEST 1: Controller registration with valid ID A@b123 succeeds', async () => {
    const res = await request(app)
      .post('/api/v1/auth/controller/register')
      .send({
        name: 'Chief Controller Vikram',
        email: 'vikram.ctrl@railway.gov.in',
        controllerId: 'A@b123',
        password: 'Password123!',
        confirmPassword: 'Password123!',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe('vikram.ctrl@railway.gov.in');
    expect(res.body.data.user.role).toBe(Role.CONTROLLER);
    expect(res.body.data.user.department).toBe(Department.CONTROLLER);
    expect(res.body.data.user.controllerId).toBe('A@b123');
    expect(res.body.data.token).toBeDefined();

    // Verify password is not exposed
    expect(res.body.data.user.passwordHash).toBeUndefined();
    expect(res.body.data.user.password).toBeUndefined();
  });

  // TEST 2: Controller ID too short: A@b12 -> validation failure
  it('TEST 2: Controller ID too short (5 chars) fails validation', async () => {
    const res = await request(app)
      .post('/api/v1/auth/controller/register')
      .send({
        name: 'Controller Short',
        email: 'short@railway.gov.in',
        controllerId: 'A@b12',
        password: 'Password123!',
        confirmPassword: 'Password123!',
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toMatch(/6 characters/i);
  });

  // TEST 3: Controller ID too long: A@b1234 -> validation failure
  it('TEST 3: Controller ID too long (7 chars) fails validation', async () => {
    const res = await request(app)
      .post('/api/v1/auth/controller/register')
      .send({
        name: 'Controller Long',
        email: 'long@railway.gov.in',
        controllerId: 'A@b1234',
        password: 'Password123!',
        confirmPassword: 'Password123!',
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toMatch(/6 characters/i);
  });

  // TEST 4: No uppercase: a@b123 -> failure
  it('TEST 4: Controller ID with no uppercase fails validation', async () => {
    const res = await request(app)
      .post('/api/v1/auth/controller/register')
      .send({
        name: 'Controller NoUpper',
        email: 'noupper@railway.gov.in',
        controllerId: 'a@b123',
        password: 'Password123!',
        confirmPassword: 'Password123!',
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toMatch(/uppercase/i);
  });

  // TEST 5: No lowercase: A@B123 -> failure
  it('TEST 5: Controller ID with no lowercase fails validation', async () => {
    const res = await request(app)
      .post('/api/v1/auth/controller/register')
      .send({
        name: 'Controller NoLower',
        email: 'nolower@railway.gov.in',
        controllerId: 'A@B123',
        password: 'Password123!',
        confirmPassword: 'Password123!',
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toMatch(/lowercase/i);
  });

  // TEST 6: No special: Abc123 -> failure
  it('TEST 6: Controller ID with no special character fails validation', async () => {
    const res = await request(app)
      .post('/api/v1/auth/controller/register')
      .send({
        name: 'Controller NoSpecial',
        email: 'nospecial@railway.gov.in',
        controllerId: 'Abc123',
        password: 'Password123!',
        confirmPassword: 'Password123!',
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toMatch(/special character/i);
  });

  // TEST 7: Duplicate Controller ID: A@b123 -> failure
  it('TEST 7: Duplicate Controller ID registration is rejected with 409', async () => {
    await request(app)
      .post('/api/v1/auth/controller/register')
      .send({
        name: 'Controller One',
        email: 'ctrl1@railway.gov.in',
        controllerId: 'A@b123',
        password: 'Password123!',
        confirmPassword: 'Password123!',
      });

    const res = await request(app)
      .post('/api/v1/auth/controller/register')
      .send({
        name: 'Controller Two',
        email: 'ctrl2@railway.gov.in',
        controllerId: 'A@b123',
        password: 'Password123!',
        confirmPassword: 'Password123!',
      });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toMatch(/Controller ID is already registered/i);
  });

  // TEST 8: Controller login: email + controllerId + password -> success
  it('TEST 8: Controller login with email + controllerId + password succeeds', async () => {
    await request(app)
      .post('/api/v1/auth/controller/register')
      .send({
        name: 'Chief Controller Rahul',
        email: 'rahul@railway.gov.in',
        controllerId: 'R#x7K2',
        password: 'SecurePassword123!',
        confirmPassword: 'SecurePassword123!',
      });

    const res = await request(app)
      .post('/api/v1/auth/controller/login')
      .send({
        email: 'rahul@railway.gov.in',
        controllerId: 'R#x7K2',
        password: 'SecurePassword123!',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.user.role).toBe(Role.CONTROLLER);
    expect(res.body.data.user.controllerId).toBe('R#x7K2');
  });

  // TEST 9: Wrong controller ID -> authentication failure
  it('TEST 9: Controller login with incorrect controller ID fails with 401', async () => {
    await request(app)
      .post('/api/v1/auth/controller/register')
      .send({
        name: 'Controller Priya',
        email: 'priya@railway.gov.in',
        controllerId: 'M$p4Q8',
        password: 'Password123!',
        confirmPassword: 'Password123!',
      });

    const res = await request(app)
      .post('/api/v1/auth/controller/login')
      .send({
        email: 'priya@railway.gov.in',
        controllerId: 'W#o9K1', // Wrong ID
        password: 'Password123!',
      });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toMatch(/Invalid controller credentials/i);
  });

  // TEST 10: Wrong password -> authentication failure
  it('TEST 10: Controller login with wrong password fails with 401', async () => {
    await request(app)
      .post('/api/v1/auth/controller/register')
      .send({
        name: 'Controller Ankit',
        email: 'ankit@railway.gov.in',
        controllerId: 'A@b123',
        password: 'CorrectPassword123!',
        confirmPassword: 'CorrectPassword123!',
      });

    const res = await request(app)
      .post('/api/v1/auth/controller/login')
      .send({
        email: 'ankit@railway.gov.in',
        controllerId: 'A@b123',
        password: 'WrongPassword!',
      });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toMatch(/Invalid controller credentials/i);
  });

  // TEST 11: Worker registration -> Worker Dashboard data & null/absent controllerId
  it('TEST 11: Worker registration creates worker without controllerId', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Engineer Amit',
        email: 'amit@railway.gov.in',
        password: 'Password123!',
        role: Role.MAINTENANCE_SNT,
        department: Department.SNT,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe(Role.MAINTENANCE_SNT);
    expect(res.body.data.user.controllerId).toBeUndefined();
  });

  // TEST 12: Worker attempting controller login fails
  it('TEST 12: Worker cannot authenticate via Controller Login endpoint', async () => {
    await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Engineer Suresh',
        email: 'suresh@railway.gov.in',
        password: 'Password123!',
        role: Role.MAINTENANCE_ENGINEERING,
        department: Department.ENGINEERING,
      });

    const res = await request(app)
      .post('/api/v1/auth/controller/login')
      .send({
        email: 'suresh@railway.gov.in',
        controllerId: 'A@b123',
        password: 'Password123!',
      });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  // TEST 13: Controller user cannot log in via worker login without Controller ID
  it('TEST 13: Controller user cannot bypass Controller ID via worker login', async () => {
    await request(app)
      .post('/api/v1/auth/controller/register')
      .send({
        name: 'Chief Controller Dev',
        email: 'dev@railway.gov.in',
        controllerId: 'D#v9K3',
        password: 'Password123!',
        confirmPassword: 'Password123!',
      });

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'dev@railway.gov.in',
        password: 'Password123!',
      });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toMatch(/Controller ID/i);
  });

  // TEST 14: Hard refresh controller /me -> session restored with controllerId
  it('TEST 14: Controller /me restores session including verified controllerId', async () => {
    const regRes = await request(app)
      .post('/api/v1/auth/controller/register')
      .send({
        name: 'Controller Neha',
        email: 'neha@railway.gov.in',
        controllerId: 'N$h8Q2',
        password: 'Password123!',
        confirmPassword: 'Password123!',
      });

    const token = regRes.body.data.token;

    const meRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.data.role).toBe(Role.CONTROLLER);
    expect(meRes.body.data.controllerId).toBe('N$h8Q2');
  });

  // TEST 15: Logout -> session invalidated
  it('TEST 15: Logout clears session', async () => {
    const regRes = await request(app)
      .post('/api/v1/auth/controller/register')
      .send({
        name: 'Controller Tara',
        email: 'tara@railway.gov.in',
        controllerId: 'T@r123',
        password: 'Password123!',
        confirmPassword: 'Password123!',
      });

    const cookies = regRes.headers['set-cookie'];

    const logoutRes = await request(app)
      .post('/api/v1/auth/logout')
      .set('Cookie', cookies);

    expect(logoutRes.status).toBe(200);
    expect(logoutRes.body.success).toBe(true);
  });
});
