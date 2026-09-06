import { describe, it, expect, vi } from 'vitest';
import axios from 'axios';
import { brainClient } from '../src/server/services/brainClient';
import { BrainAnalyzeRequest, BrainPlanningState } from '../src/server/types';
import { ErrorCode, PlanningMode } from '../src/server/config/constants';

describe('Brain Client & Contract Validation', () => {
  const dummyPlanningState: BrainPlanningState = {
    version: 1,
    planning_mode: PlanningMode.INITIAL,
    fixed_plans: [],
    pending_requests: [],
  };

  const validPayload: BrainAnalyzeRequest = {
    request_id: 'REQ-CONTRACT-001',
    from_station: 'NDLS',
    to_station: 'CNB',
    duration_minutes: 120,
    earliest_start: '2026-09-05T06:00:00.000Z',
    latest_end: '2026-09-05T12:00:00.000Z',
    priority: 'HIGH',
    planning_state: dummyPlanningState,
  };

  it('should format Section 43 payload with all required contract fields', () => {
    expect(validPayload.request_id).toBeDefined();
    expect(validPayload.from_station).toBe('NDLS');
    expect(validPayload.to_station).toBe('CNB');
    expect(validPayload.duration_minutes).toBe(120);
    expect(validPayload.earliest_start).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(validPayload.latest_end).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(validPayload.planning_state).toBeDefined();
    expect(validPayload.planning_state?.version).toBe(1);
    expect(Array.isArray(validPayload.planning_state?.fixed_plans)).toBe(true);
    expect(Array.isArray(validPayload.planning_state?.pending_requests)).toBe(true);
  });

  it('should propagate Brain analysis result when microservice succeeds', async () => {
    const mockBrainResponse = {
      success: true,
      request_id: 'REQ-CONTRACT-001',
      status: 'RECOMMENDED',
      recommendation: {
        start: '2026-09-05T07:00:00Z',
        end: '2026-09-05T09:00:00Z',
        impact_score: 34.5,
      },
      metrics: {
        total_cascade_delay_minutes: 15,
        total_trains_delayed: 2,
        impact_score: 34.5,
      },
      conflicts: [],
      alternatives: [],
    };

    vi.spyOn(brainClient.getClient(), 'post').mockResolvedValueOnce({
      status: 200,
      data: mockBrainResponse,
    });

    const result = await brainClient.analyzeMaintenanceWindow(validPayload);
    expect(result.success).toBe(true);
    expect(result.recommendation?.impact_score).toBe(34.5);
    expect(result.metrics.impact_score).toBe(34.5);
  });

  it('should fail fast and throw BRAIN_UNAVAILABLE when Brain service is down (NEVER fabricate fallback)', async () => {
    const connError: any = new Error('connect ECONNREFUSED 127.0.0.1:8000');
    connError.code = 'ECONNREFUSED';
    vi.spyOn(brainClient.getClient(), 'post').mockRejectedValueOnce(connError);

    try {
      await brainClient.analyzeMaintenanceWindow(validPayload);
      expect.fail('Should have thrown an error');
    } catch (err: any) {
      expect(err.code).toBe(ErrorCode.BRAIN_UNAVAILABLE);
      expect(err.statusCode).toBe(503);
    }
  });

  it('should propagate BRAIN_INVALID_RESPONSE when Brain returns error response', async () => {
    vi.spyOn(brainClient.getClient(), 'post').mockRejectedValueOnce({
      response: {
        status: 500,
        data: { message: 'Optimization timeout in cascade engine' },
      },
      message: 'Request failed with status code 500',
    });

    try {
      await brainClient.analyzeMaintenanceWindow(validPayload);
      expect.fail('Should have thrown an error');
    } catch (err: any) {
      expect(err.code).toBe(ErrorCode.BRAIN_INVALID_RESPONSE);
      expect(err.statusCode).toBe(502);
    }
  });

  it('should reject malformed Brain response with INVALID_BRAIN_RESPONSE (502) via runtime validator', async () => {
    vi.spyOn(brainClient.getClient(), 'post').mockResolvedValueOnce({
      status: 200,
      data: {
        success: true,
        request_id: 'REQ-MALFORMED',
        // missing status, metrics, conflicts, alternatives
      },
    });

    try {
      await brainClient.analyzeMaintenanceWindow(validPayload);
      expect.fail('Should have rejected malformed Brain response');
    } catch (err: any) {
      expect(err.code).toBe(ErrorCode.INVALID_BRAIN_RESPONSE);
      expect(err.statusCode).toBe(502);
    }
  });
});
