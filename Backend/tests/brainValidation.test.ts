import { describe, it, expect } from 'vitest';
import { validateBrainResponse } from '../src/server/services/brainValidator';
import { ErrorCode } from '../src/server/config/constants';

describe('Brain Response Runtime Validator (brainValidator)', () => {
  const validBrainResponse = {
    success: true,
    request_id: 'REQ-VAL-001',
    status: 'RECOMMENDED',
    metrics: {
      total_cascade_delay_minutes: 10,
      total_trains_delayed: 1,
      impact_score: 25.0,
    },
    conflicts: [
      {
        train_number: 12001,
        train_type: 'EXPRESS',
        from_station: 'NDLS',
        to_station: 'GZB',
        train_entry: '2026-09-05T08:00:00Z',
        train_exit: '2026-09-05T08:30:00Z',
        overlap_minutes: 30,
      },
    ],
    alternatives: [
      {
        start: '2026-09-05T09:00:00Z',
        end: '2026-09-05T11:00:00Z',
        conflict_count: 0,
        direct_delay_minutes: 0,
        impact_score: 15.0,
      },
    ],
    recommendation: {
      start: '2026-09-05T07:00:00Z',
      end: '2026-09-05T09:00:00Z',
      impact_score: 25.0,
    },
    score_breakdown: [
      {
        factor: 'PASSENGER_DELAY',
        raw_value: 10,
        weight: 0.4,
        weighted_value: 4.0,
        status: 'ACCEPTABLE',
        source: 'CASCADE_SIMULATION',
      },
    ],
    delay_trace: [
      {
        train_number: 12001,
        movement_index: 0,
        delay_type: 'PRIMARY',
        delay_minutes: 10,
        from_station: 'NDLS',
        to_station: 'GZB',
        original_start: '2026-09-05T08:00:00Z',
        original_end: '2026-09-05T08:30:00Z',
        shifted_start: '2026-09-05T08:10:00Z',
        shifted_end: '2026-09-05T08:40:00Z',
      },
    ],
    bundles: [
      {
        bundle_id: 'BUN-001',
        request_ids: ['REQ-VAL-001'],
        section: 'NDLS-GZB',
        combined_start: '2026-09-05T07:00:00Z',
        combined_end: '2026-09-05T09:00:00Z',
        combined_duration_minutes: 120,
        bundle_impact_score: 25.0,
        individual_impact_sum: 25.0,
        recommendation: 'BUNDLE',
      },
    ],
    metadata: {
      request_id: 'REQ-VAL-001',
      brain_run_id: 'RUN-VAL-001',
      trace_id: 'TRACE-001',
      dataset_version: 'v1.0',
      algorithm_version: 'v1.0',
      cascade_simulation: 'ENABLED',
      candidate_windows_evaluated: 15,
      window_step_minutes: 15,
    },
  };

  it('valid response passes validation cleanly', () => {
    const validated = validateBrainResponse(validBrainResponse);
    expect(validated.success).toBe(true);
    expect(validated.request_id).toBe('REQ-VAL-001');
    expect(validated.status).toBe('RECOMMENDED');
    expect(validated.recommendation?.start).toBe('2026-09-05T07:00:00Z');
    expect(validated.score_breakdown).toBeDefined();
    expect(validated.score_breakdown?.[0].factor).toBe('PASSENGER_DELAY');
  });

  it('rejects null or non-object payloads with 502 INVALID_BRAIN_RESPONSE', () => {
    expect(() => validateBrainResponse(null)).toThrowError();
    try {
      validateBrainResponse('not an object');
    } catch (err: any) {
      expect(err.statusCode).toBe(502);
      expect(err.code).toBe(ErrorCode.INVALID_BRAIN_RESPONSE);
    }
  });

  it('rejects payload missing success boolean with 502', () => {
    const payload = { ...validBrainResponse, success: 'true' };
    try {
      validateBrainResponse(payload);
      expect.fail('Should reject invalid success');
    } catch (err: any) {
      expect(err.statusCode).toBe(502);
      expect(err.code).toBe(ErrorCode.INVALID_BRAIN_RESPONSE);
      expect(err.message).toContain("'success'");
    }
  });

  it('rejects payload with missing request_id', () => {
    const payload = { ...validBrainResponse, request_id: '' };
    try {
      validateBrainResponse(payload);
      expect.fail('Should reject empty request_id');
    } catch (err: any) {
      expect(err.statusCode).toBe(502);
      expect(err.code).toBe(ErrorCode.INVALID_BRAIN_RESPONSE);
      expect(err.message).toContain("'request_id'");
    }
  });

  it('rejects payload with missing status', () => {
    const { status, ...payload } = validBrainResponse;
    try {
      validateBrainResponse(payload);
      expect.fail('Should reject missing status');
    } catch (err: any) {
      expect(err.statusCode).toBe(502);
      expect(err.code).toBe(ErrorCode.INVALID_BRAIN_RESPONSE);
      expect(err.message).toContain("'status'");
    }
  });

  it('rejects payload with missing metrics', () => {
    const { metrics, ...payload } = validBrainResponse;
    try {
      validateBrainResponse(payload);
      expect.fail('Should reject missing metrics');
    } catch (err: any) {
      expect(err.statusCode).toBe(502);
      expect(err.code).toBe(ErrorCode.INVALID_BRAIN_RESPONSE);
      expect(err.message).toContain("'metrics'");
    }
  });

  it('rejects payload with wrong metrics type (e.g. string or array)', () => {
    const payload = { ...validBrainResponse, metrics: 'invalid_metrics_string' };
    try {
      validateBrainResponse(payload);
      expect.fail('Should reject non-object metrics');
    } catch (err: any) {
      expect(err.statusCode).toBe(502);
      expect(err.code).toBe(ErrorCode.INVALID_BRAIN_RESPONSE);
    }
  });

  it('rejects payload with missing conflicts array', () => {
    const { conflicts, ...payload } = validBrainResponse;
    try {
      validateBrainResponse(payload);
      expect.fail('Should reject missing conflicts');
    } catch (err: any) {
      expect(err.statusCode).toBe(502);
      expect(err.code).toBe(ErrorCode.INVALID_BRAIN_RESPONSE);
      expect(err.message).toContain("'conflicts'");
    }
  });

  it('rejects payload with malformed recommendation (missing end)', () => {
    const payload = {
      ...validBrainResponse,
      recommendation: { start: '2026-09-05T07:00:00Z', impact_score: 20 },
    };
    try {
      validateBrainResponse(payload);
      expect.fail('Should reject malformed recommendation');
    } catch (err: any) {
      expect(err.statusCode).toBe(502);
      expect(err.code).toBe(ErrorCode.INVALID_BRAIN_RESPONSE);
      expect(err.message).toContain("'recommendation.end'");
    }
  });

  it('rejects payload with malformed score_breakdown item', () => {
    const payload = {
      ...validBrainResponse,
      score_breakdown: [
        {
          factor: 'PASSENGER_DELAY',
          raw_value: 'not a number', // invalid type
          weight: 0.4,
          weighted_value: 4.0,
          status: 'ACCEPTABLE',
          source: 'CASCADE_SIMULATION',
        },
      ],
    };
    try {
      validateBrainResponse(payload);
      expect.fail('Should reject malformed score_breakdown');
    } catch (err: any) {
      expect(err.statusCode).toBe(502);
      expect(err.code).toBe(ErrorCode.INVALID_BRAIN_RESPONSE);
      expect(err.message).toContain("'score_breakdown[0].raw_value'");
    }
  });

  it('rejects payload with malformed alternatives item', () => {
    const payload = {
      ...validBrainResponse,
      alternatives: [{ start: '2026-09-05T09:00:00Z' /* missing end */ }],
    };
    try {
      validateBrainResponse(payload);
      expect.fail('Should reject malformed alternative');
    } catch (err: any) {
      expect(err.statusCode).toBe(502);
      expect(err.code).toBe(ErrorCode.INVALID_BRAIN_RESPONSE);
    }
  });

  it('rejects payload with malformed bundles item', () => {
    const payload = {
      ...validBrainResponse,
      bundles: [{ bundle_id: 123 /* should be string */ }],
    };
    try {
      validateBrainResponse(payload);
      expect.fail('Should reject malformed bundle');
    } catch (err: any) {
      expect(err.statusCode).toBe(502);
      expect(err.code).toBe(ErrorCode.INVALID_BRAIN_RESPONSE);
    }
  });

  it('rejects payload where recommendations contains malformed item', () => {
    const payload = {
      ...validBrainResponse,
      recommendations: [
        {
          request_id: 'REQ-PLAN-01',
          recommendation: { start: 12345 /* invalid type */, end: '2026-09-05T09:00:00Z' },
        },
      ],
    };
    try {
      validateBrainResponse(payload);
      expect.fail('Should reject malformed recommendations item');
    } catch (err: any) {
      expect(err.statusCode).toBe(502);
      expect(err.code).toBe(ErrorCode.INVALID_BRAIN_RESPONSE);
    }
  });

  it('rejects payload where delay_trace contains malformed item', () => {
    const payload = {
      ...validBrainResponse,
      delay_trace: [
        {
          train_number: 'NOT_A_NUMBER', // invalid type
          delay_type: 'PRIMARY',
          delay_minutes: 15,
        },
      ],
    };
    try {
      validateBrainResponse(payload);
      expect.fail('Should reject malformed delay_trace item');
    } catch (err: any) {
      expect(err.statusCode).toBe(502);
      expect(err.code).toBe(ErrorCode.INVALID_BRAIN_RESPONSE);
    }
  });

  it('rejects payload where score_breakdown contains malformed weight or status', () => {
    const payload = {
      ...validBrainResponse,
      score_breakdown: [
        {
          factor: 'PASSENGER_DELAY',
          raw_value: 10,
          weight: 'INVALID_WEIGHT', // should be number
          weighted_value: 4.0,
          status: 'ACCEPTABLE',
        },
      ],
    };
    try {
      validateBrainResponse(payload);
      expect.fail('Should reject malformed score_breakdown weight');
    } catch (err: any) {
      expect(err.statusCode).toBe(502);
      expect(err.code).toBe(ErrorCode.INVALID_BRAIN_RESPONSE);
    }
  });

  it('rejects payload where metadata has invalid field type', () => {
    const payload = {
      ...validBrainResponse,
      metadata: {
        algorithm_version: 12345, // should be string
      },
    };
    try {
      validateBrainResponse(payload);
      expect.fail('Should reject invalid metadata field type');
    } catch (err: any) {
      expect(err.statusCode).toBe(502);
      expect(err.code).toBe(ErrorCode.INVALID_BRAIN_RESPONSE);
    }
  });

  it('rejects payload where bundles request_ids contains non-string elements', () => {
    const payload = {
      ...validBrainResponse,
      bundles: [
        {
          bundle_id: 'BUN-INVALID-REQ-IDS',
          request_ids: [123, null, {}], // invalid elements
          section: 'NDLS-CNB',
          combined_start: '2026-09-05T07:00:00Z',
          combined_end: '2026-09-05T09:00:00Z',
          bundle_impact_score: 25.0,
        },
      ],
    };
    try {
      validateBrainResponse(payload);
      expect.fail('Should reject non-string request_ids elements');
    } catch (err: any) {
      expect(err.statusCode).toBe(502);
      expect(err.code).toBe(ErrorCode.INVALID_BRAIN_RESPONSE);
      expect(err.message).toContain('must be a non-empty string ID');
    }
  });

  it('rejects payload where metadata contains completely unrecognized / arbitrary fields', () => {
    const payload = {
      ...validBrainResponse,
      metadata: {
        anything: 'garbage',
        unknown_key: 999,
      },
    };
    try {
      validateBrainResponse(payload);
      expect.fail('Should reject arbitrary metadata object');
    } catch (err: any) {
      expect(err.statusCode).toBe(502);
      expect(err.code).toBe(ErrorCode.INVALID_BRAIN_RESPONSE);
      expect(err.message).toContain('no recognized operational fields');
    }
  });
});
