import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { app } from '../src/server/app';
import { User } from '../src/server/models/User';
import { MaintenanceRequest } from '../src/server/models/MaintenanceRequest';
import { ControllerDecision } from '../src/server/models/ControllerDecision';
import { BrainRun } from '../src/server/models/BrainRun';
import { Role, Department, RequestStatus, RequestPriority } from '../src/server/config/constants';
import { brainClient } from '../src/server/services/brainClient';
import { BrainAnalyzeResponse } from '../src/server/types';

describe('What-If Simulation Isolation', () => {
  let controllerToken: string;
  let engUserId: string;

  beforeEach(async () => {
    await User.deleteMany({});
    await MaintenanceRequest.deleteMany({});
    await ControllerDecision.deleteMany({});
    await BrainRun.deleteMany({});

    // Register Controller
    const ctrlRes = await request(app).post('/api/v1/auth/controller/register').send({
      name: 'Simulation Controller',
      email: 'simctrl@railway.gov.in',
      controllerId: 'Sim@12',
      password: 'Password123!',
      confirmPassword: 'Password123!',
    });
    controllerToken = ctrlRes.body.data.token;
    engUserId = ctrlRes.body.data.user.id;

  });

  it('should run what-if simulation without mutating database or altering existing request', async () => {
    // 1. Create a baseline request in DB
    await MaintenanceRequest.create({
      requestId: 'REQ-WHATIF-001',
      createdBy: engUserId,
      department: Department.ENGINEERING,
      maintenanceType: 'TURNOUT_REPLACEMENT',
      fromStation: 'NDLS',
      toStation: 'CNB',
      durationMinutes: 180,
      earliestStart: new Date('2026-09-05T06:00:00Z'),
      latestEnd: new Date('2026-09-05T14:00:00Z'),
      priority: RequestPriority.HIGH,
      status: RequestStatus.RECOMMENDED,
      planningVersion: 2,
    });

    const mockSimulationResult: BrainAnalyzeResponse = {
      success: true,
      request_id: 'REQ-WHATIF-001',
      recommendation: {
        start: '2026-09-05T08:00:00.000Z',
        end: '2026-09-05T10:00:00.000Z',
        impact_score: 11.5,
      },
      metrics: {
        total_cascade_delay_minutes: 5,
        total_trains_delayed: 1,
        impact_score: 11.5,
      },
      conflicts: [],
      alternatives: [],
    };

    vi.spyOn(brainClient, 'analyzeMaintenanceWindow').mockResolvedValueOnce(mockSimulationResult);

    // 2. Run What-If simulation with modified duration (120 mins instead of 180)
    const simRes = await request(app)
      .post('/api/v1/controller/whatif')
      .set('Authorization', `Bearer ${controllerToken}`)
      .send({
        requestId: 'REQ-WHATIF-001',
        overrides: {
          durationMinutes: 120,
        },
      });

    expect(simRes.status).toBe(200);
    expect(simRes.body.success).toBe(true);
    expect(simRes.body.data.isSimulation).toBe(true);
    expect(simRes.body.data.simulationResult.metrics.impact_score).toBe(11.5);

    // 3. CRITICAL: Verify Zero Database Mutation
    const reqAfterSim = await MaintenanceRequest.findOne({ requestId: 'REQ-WHATIF-001' });
    expect(reqAfterSim).toBeDefined();
    // Duration must still be original 180 minutes, NOT 120
    expect(reqAfterSim?.durationMinutes).toBe(180);
    // Status must still be RECOMMENDED
    expect(reqAfterSim?.status).toBe(RequestStatus.RECOMMENDED);

    // Zero BrainRuns created
    const brainRunCount = await BrainRun.countDocuments();
    expect(brainRunCount).toBe(0);

    // Zero ControllerDecisions created
    const decisionCount = await ControllerDecision.countDocuments();
    expect(decisionCount).toBe(0);
  });
});
