import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../../src/server/app';

describe('Health Check & App Initialization', () => {
  it('GET /api/v1/health should return ok', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.service).toBe('railnexus-backend');
  });

  it('GET /unknown-route should return standardized 404', async () => {
    const res = await request(app).get('/unknown-route');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBeDefined();
  });
});
