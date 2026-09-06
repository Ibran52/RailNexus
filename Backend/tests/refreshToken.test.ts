/**
 * refreshToken.test.ts — RailNexus Backend
 * Comprehensive test suite for secure refresh token authentication, rotation,
 * reuse detection, expiration, logout, and cookie security.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../src/server/app';
import { User } from '../src/server/models/User';
import { RefreshSession } from '../src/server/models/RefreshSession';
import { Department, ErrorCode, Role } from '../src/server/config/constants';
import { hashToken, REFRESH_COOKIE_NAME } from '../src/server/services/authService';
import { env } from '../src/server/config/env';

describe('Refresh Token Authentication Suite', () => {
  beforeEach(async () => {
    await User.deleteMany({});
    await RefreshSession.deleteMany({});
  });

  function extractCookie(res: any, name: string): string | undefined {
    const cookies: string[] = res.headers['set-cookie'] || [];
    for (const cookie of cookies) {
      if (cookie.startsWith(`${name}=`)) {
        return cookie.split(';')[0].split('=')[1];
      }
    }
    return undefined;
  }

  it('login should issue access token in body and store hashed refresh token in HttpOnly cookie', async () => {
    // 1. Register a user
    const regRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Station Master Dave',
        email: 'dave@railway.gov.in',
        password: 'Password123!',
        role: Role.MAINTENANCE_ENGINEERING,
        department: Department.ENGINEERING,
      });

    expect(regRes.status).toBe(201);

    // 2. Login
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'dave@railway.gov.in',
        password: 'Password123!',
      });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.success).toBe(true);
    expect(loginRes.body.data.token).toBeDefined();

    // Raw refresh token MUST NOT be in response body
    expect(loginRes.body.data.refreshToken).toBeUndefined();

    // Cookie checks
    const rawHeaders = loginRes.headers['set-cookie'];
    const setCookieHeaders: string[] = Array.isArray(rawHeaders) ? rawHeaders : (rawHeaders ? [rawHeaders] : []);
    expect(setCookieHeaders.length).toBeGreaterThan(0);
    const refreshCookieStr = setCookieHeaders.find((c: string) => c.startsWith(`${REFRESH_COOKIE_NAME}=`));
    expect(refreshCookieStr).toBeDefined();
    expect(refreshCookieStr).toMatch(/HttpOnly/i);
    expect(refreshCookieStr).toMatch(/SameSite=Lax/i);

    const rawToken = extractCookie(loginRes, REFRESH_COOKIE_NAME);
    expect(rawToken).toBeDefined();

    // Verify DB storage: ONLY secure hash is stored, NEVER raw token
    const tokenHash = hashToken(rawToken!);
    const session = await RefreshSession.findOne({ tokenHash });
    expect(session).toBeDefined();
    expect(session?.revokedAt).toBeNull();
    expect(session?.expiresAt.getTime()).toBeGreaterThan(Date.now());

    // Verify raw token is not stored in MongoDB
    const rawMatch = await RefreshSession.findOne({ tokenHash: rawToken });
    expect(rawMatch).toBeNull();
  });

  it('should successfully refresh tokens and rotate refresh token', async () => {
    // 1. Login to get initial cookies
    await request(app).post('/api/v1/auth/register').send({
      name: 'OHE Tech Dave',
      email: 'ohe_dave@railway.gov.in',
      password: 'Password123!',
      role: Role.MAINTENANCE_OHE,
      department: Department.OHE,
    });

    const loginRes = await request(app).post('/api/v1/auth/login').send({
      email: 'ohe_dave@railway.gov.in',
      password: 'Password123!',
    });

    const oldRawToken = extractCookie(loginRes, REFRESH_COOKIE_NAME)!;
    const oldTokenHash = hashToken(oldRawToken);

    // 2. Refresh with cookie
    const refreshRes = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', [`${REFRESH_COOKIE_NAME}=${oldRawToken}`]);

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.success).toBe(true);
    expect(refreshRes.body.data.token).toBeDefined();
    expect(refreshRes.body.data.user.email).toBe('ohe_dave@railway.gov.in');

    // New rotated cookie received
    const newRawToken = extractCookie(refreshRes, REFRESH_COOKIE_NAME)!;
    expect(newRawToken).toBeDefined();
    expect(newRawToken).not.toBe(oldRawToken);

    // 3. Verify old session is invalidated and points to replacement
    const oldSession = await RefreshSession.findOne({ tokenHash: oldTokenHash });
    expect(oldSession?.revokedAt).not.toBeNull();
    const newTokenHash = hashToken(newRawToken);
    expect(oldSession?.replacedByTokenHash).toBe(newTokenHash);

    // 4. Verify new session is active
    const newSession = await RefreshSession.findOne({ tokenHash: newTokenHash });
    expect(newSession).toBeDefined();
    expect(newSession?.revokedAt).toBeNull();

    // 5. Verify new access token works against protected endpoint
    const meRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${refreshRes.body.data.token}`);
    expect(meRes.status).toBe(200);
    expect(meRes.body.data.email).toBe('ohe_dave@railway.gov.in');
  });

  it('should detect reuse of a rotated refresh token and revoke all active user sessions', async () => {
    // 1. Register & Login
    await request(app).post('/api/v1/auth/register').send({
      name: 'Security Test User',
      email: 'security@railway.gov.in',
      password: 'Password123!',
      role: Role.MAINTENANCE_ENGINEERING,
      department: Department.ENGINEERING,
    });

    const loginRes = await request(app).post('/api/v1/auth/login').send({
      email: 'security@railway.gov.in',
      password: 'Password123!',
    });

    const token1 = extractCookie(loginRes, REFRESH_COOKIE_NAME)!;

    // 2. Perform legitimate refresh (token1 -> token2)
    const refresh1Res = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', [`${REFRESH_COOKIE_NAME}=${token1}`]);
    expect(refresh1Res.status).toBe(200);
    const token2 = extractCookie(refresh1Res, REFRESH_COOKIE_NAME)!;

    // 3. ATTACKER REUSE: Present already rotated token1 again
    const reuseRes = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', [`${REFRESH_COOKIE_NAME}=${token1}`]);

    expect(reuseRes.status).toBe(401);
    expect(reuseRes.body.success).toBe(false);
    expect(reuseRes.body.error.code).toBe(ErrorCode.UNAUTHORIZED);
    expect(reuseRes.body.error.message).toMatch(/already been used or revoked/i);

    // 4. Verify that token2's session has also been REVOKED due to reuse breach detection
    const token2Hash = hashToken(token2);
    const session2 = await RefreshSession.findOne({ tokenHash: token2Hash });
    expect(session2?.revokedAt).not.toBeNull();

    // 5. Token2 can no longer be used
    const refresh2Res = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', [`${REFRESH_COOKIE_NAME}=${token2}`]);
    expect(refresh2Res.status).toBe(401);
  });

  it('should reject refresh when refresh token is missing', async () => {
    const res = await request(app).post('/api/v1/auth/refresh');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe(ErrorCode.UNAUTHORIZED);
    expect(res.body.error.message).toMatch(/missing/i);
  });

  it('should reject expired refresh tokens', async () => {
    // 1. Create a user
    const user = await User.create({
      name: 'Expired Token User',
      email: 'expired@railway.gov.in',
      passwordHash: 'dummy',
      role: Role.CONTROLLER,
      department: Department.CONTROLLER,
      isActive: true,
    });

    // 2. Generate an expired refresh token
    const expiredToken = jwt.sign(
      { sub: user._id.toString(), type: 'refresh' },
      env.REFRESH_TOKEN_SECRET,
      { expiresIn: '-1s' }
    );

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', [`${REFRESH_COOKIE_NAME}=${expiredToken}`]);

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe(ErrorCode.UNAUTHORIZED);
    expect(res.body.error.message).toMatch(/expired/i);
  });

  it('should reject malformed or tampered refresh tokens', async () => {
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', [`${REFRESH_COOKIE_NAME}=not_a_valid_jwt_token_string`]);

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe(ErrorCode.UNAUTHORIZED);
    expect(res.body.error.message).toMatch(/invalid|malformed/i);
  });

  it('should logout by revoking refresh session and clearing cookie', async () => {
    // 1. Register & Login
    await request(app).post('/api/v1/auth/register').send({
      name: 'Logout Test User',
      email: 'logout@railway.gov.in',
      password: 'Password123!',
      role: Role.MAINTENANCE_ENGINEERING,
      department: Department.ENGINEERING,
    });

    const loginRes = await request(app).post('/api/v1/auth/login').send({
      email: 'logout@railway.gov.in',
      password: 'Password123!',
    });

    const rawToken = extractCookie(loginRes, REFRESH_COOKIE_NAME)!;
    const tokenHash = hashToken(rawToken);

    // Verify session active
    let session = await RefreshSession.findOne({ tokenHash });
    expect(session?.revokedAt).toBeNull();

    // 2. Call logout
    const logoutRes = await request(app)
      .post('/api/v1/auth/logout')
      .set('Cookie', [`${REFRESH_COOKIE_NAME}=${rawToken}`]);

    expect(logoutRes.status).toBe(200);
    expect(logoutRes.body.success).toBe(true);
    expect(logoutRes.body.message).toMatch(/logged out/i);

    // 3. Verify session is now revoked in DB
    session = await RefreshSession.findOne({ tokenHash });
    expect(session?.revokedAt).not.toBeNull();

    // 4. Verify cookie was cleared (Expires or Max-Age=0)
    const rawLogoutHeaders = logoutRes.headers['set-cookie'];
    const setCookieHeaders = Array.isArray(rawLogoutHeaders) ? rawLogoutHeaders : (rawLogoutHeaders ? [rawLogoutHeaders] : []);
    expect(setCookieHeaders.length).toBeGreaterThan(0);
    const clearedCookie = setCookieHeaders.find((c: string) => c.startsWith(`${REFRESH_COOKIE_NAME}=`));
    expect(clearedCookie).toMatch(/Expires=Thu, 01 Jan 1970|Max-Age=0/i);

    // 5. Subsequent refresh attempt with logged-out token fails
    const refreshRes = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', [`${REFRESH_COOKIE_NAME}=${rawToken}`]);

    expect(refreshRes.status).toBe(401);
  });

  it('should also accept refresh token via request body for API clients', async () => {
    // 1. Register & Login
    await request(app).post('/api/v1/auth/register').send({
      name: 'Body Token User',
      email: 'bodytoken@railway.gov.in',
      password: 'Password123!',
      role: Role.MAINTENANCE_ENGINEERING,
      department: Department.ENGINEERING,
    });

    const loginRes = await request(app).post('/api/v1/auth/login').send({
      email: 'bodytoken@railway.gov.in',
      password: 'Password123!',
    });

    const rawToken = extractCookie(loginRes, REFRESH_COOKIE_NAME)!;

    // 2. Refresh via JSON body { refreshToken }
    const refreshRes = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: rawToken });

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.success).toBe(true);
    expect(refreshRes.body.data.token).toBeDefined();
  });

  it('should handle concurrent refresh attempts safely with exactly one winner', async () => {
    // 1. Register & Login
    await request(app).post('/api/v1/auth/register').send({
      name: 'Concurrent Refresh User',
      email: 'concurrent_refresh@railway.gov.in',
      password: 'Password123!',
      role: Role.MAINTENANCE_ENGINEERING,
      department: Department.ENGINEERING,
    });

    const loginRes = await request(app).post('/api/v1/auth/login').send({
      email: 'concurrent_refresh@railway.gov.in',
      password: 'Password123!',
    });

    const rawToken = extractCookie(loginRes, REFRESH_COOKIE_NAME)!;

    // 2. Fire 2 concurrent refresh requests using the exact same token
    const [res1, res2] = await Promise.all([
      request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', [`${REFRESH_COOKIE_NAME}=${rawToken}`]),
      request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', [`${REFRESH_COOKIE_NAME}=${rawToken}`]),
    ]);

    const statuses = [res1.status, res2.status];
    // Exactly one should succeed (200) and the other should fail (401)
    expect(statuses.filter((s) => s === 200).length).toBe(1);
    expect(statuses.filter((s) => s === 401).length).toBe(1);
  });
});
