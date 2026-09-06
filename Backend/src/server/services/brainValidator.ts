/**
 * brainValidator.ts — RailNexus Backend
 * Pure, zero-external-dependency runtime validation for Python Brain JSON responses.
 * Rejects structurally invalid, malformed, or incomplete Brain data with HTTP 502.
 */

import { AppError } from '../middleware/errorHandler';
import { ErrorCode } from '../config/constants';
import { BrainAnalyzeResponse, BrainRecommendation, BrainScoreBreakdownItem } from '../types';

export function validateBrainResponse(data: unknown): BrainAnalyzeResponse {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    const err: AppError = new Error('Brain returned malformed payload: expected a root JSON object.');
    err.statusCode = 502;
    err.code = ErrorCode.INVALID_BRAIN_RESPONSE;
    throw err;
  }

  const obj = data as Record<string, any>;

  // 1. Validate success
  if (typeof obj.success !== 'boolean') {
    const err: AppError = new Error("Brain payload violation: 'success' must be a boolean.");
    err.statusCode = 502;
    err.code = ErrorCode.INVALID_BRAIN_RESPONSE;
    throw err;
  }

  // 2. Validate request_id
  if (typeof obj.request_id !== 'string' || !obj.request_id.trim()) {
    const err: AppError = new Error("Brain payload violation: 'request_id' must be a non-empty string.");
    err.statusCode = 502;
    err.code = ErrorCode.INVALID_BRAIN_RESPONSE;
    throw err;
  }

  // 3. Validate status
  if (typeof obj.status !== 'string' || !obj.status.trim()) {
    const err: AppError = new Error("Brain payload violation: 'status' must be a non-empty string.");
    err.statusCode = 502;
    err.code = ErrorCode.INVALID_BRAIN_RESPONSE;
    throw err;
  }

  // 4. Validate metrics
  if (!obj.metrics || typeof obj.metrics !== 'object' || Array.isArray(obj.metrics)) {
    const err: AppError = new Error("Brain payload violation: 'metrics' must be a non-null object.");
    err.statusCode = 502;
    err.code = ErrorCode.INVALID_BRAIN_RESPONSE;
    throw err;
  }

  // 5. Validate conflicts
  if (!Array.isArray(obj.conflicts)) {
    const err: AppError = new Error("Brain payload violation: 'conflicts' must be an array.");
    err.statusCode = 502;
    err.code = ErrorCode.INVALID_BRAIN_RESPONSE;
    throw err;
  }

  // 6. Validate alternatives
  if (!Array.isArray(obj.alternatives)) {
    const err: AppError = new Error("Brain payload violation: 'alternatives' must be an array.");
    err.statusCode = 502;
    err.code = ErrorCode.INVALID_BRAIN_RESPONSE;
    throw err;
  }
  for (let i = 0; i < obj.alternatives.length; i++) {
    const alt = obj.alternatives[i];
    if (!alt || typeof alt !== 'object') {
      const err: AppError = new Error(`Brain payload violation: 'alternatives[${i}]' must be an object.`);
      err.statusCode = 502;
      err.code = ErrorCode.INVALID_BRAIN_RESPONSE;
      throw err;
    }
    if (typeof alt.start !== 'string' || typeof alt.end !== 'string' || !alt.start.trim() || !alt.end.trim()) {
      const err: AppError = new Error(`Brain payload violation: 'alternatives[${i}]' must contain valid start and end timestamp strings.`);
      err.statusCode = 502;
      err.code = ErrorCode.INVALID_BRAIN_RESPONSE;
      throw err;
    }
  }

  // 7. Validate recommendation
  let validatedRec: BrainRecommendation | null = null;
  if (obj.recommendation !== null && obj.recommendation !== undefined) {
    if (typeof obj.recommendation !== 'object' || Array.isArray(obj.recommendation)) {
      const err: AppError = new Error("Brain payload violation: 'recommendation' must be null or an object.");
      err.statusCode = 502;
      err.code = ErrorCode.INVALID_BRAIN_RESPONSE;
      throw err;
    }

    const rec = obj.recommendation;
    if (typeof rec.start !== 'string' || !rec.start.trim()) {
      const err: AppError = new Error("Brain payload violation: 'recommendation.start' must be a non-empty string.");
      err.statusCode = 502;
      err.code = ErrorCode.INVALID_BRAIN_RESPONSE;
      throw err;
    }
    if (typeof rec.end !== 'string' || !rec.end.trim()) {
      const err: AppError = new Error("Brain payload violation: 'recommendation.end' must be a non-empty string.");
      err.statusCode = 502;
      err.code = ErrorCode.INVALID_BRAIN_RESPONSE;
      throw err;
    }

    validatedRec = {
      start: rec.start,
      end: rec.end,
      impact_score: typeof rec.impact_score === 'number' ? rec.impact_score : 0,
      score_breakdown: Array.isArray(rec.score_breakdown) ? rec.score_breakdown : undefined,
    };
  }

  // 8. Validate optional score_breakdown when present
  if (obj.score_breakdown !== undefined && obj.score_breakdown !== null) {
    if (!Array.isArray(obj.score_breakdown)) {
      const err: AppError = new Error("Brain payload violation: 'score_breakdown' must be an array when present.");
      err.statusCode = 502;
      err.code = ErrorCode.INVALID_BRAIN_RESPONSE;
      throw err;
    }

    for (let i = 0; i < obj.score_breakdown.length; i++) {
      const item = obj.score_breakdown[i];
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        const err: AppError = new Error(`Brain payload violation: 'score_breakdown[${i}]' must be an object.`);
        err.statusCode = 502;
        err.code = ErrorCode.INVALID_BRAIN_RESPONSE;
        throw err;
      }
      if (typeof item.factor !== 'string' || !item.factor.trim()) {
        const err: AppError = new Error(`Brain payload violation: 'score_breakdown[${i}].factor' must be a non-empty string.`);
        err.statusCode = 502;
        err.code = ErrorCode.INVALID_BRAIN_RESPONSE;
        throw err;
      }
      if (typeof item.raw_value !== 'number' || isNaN(item.raw_value)) {
        const err: AppError = new Error(`Brain payload violation: 'score_breakdown[${i}].raw_value' must be a valid number.`);
        err.statusCode = 502;
        err.code = ErrorCode.INVALID_BRAIN_RESPONSE;
        throw err;
      }
      if (typeof item.weight !== 'number' || isNaN(item.weight)) {
        const err: AppError = new Error(`Brain payload violation: 'score_breakdown[${i}].weight' must be a valid number.`);
        err.statusCode = 502;
        err.code = ErrorCode.INVALID_BRAIN_RESPONSE;
        throw err;
      }
      if (typeof item.weighted_value !== 'number' || isNaN(item.weighted_value)) {
        const err: AppError = new Error(`Brain payload violation: 'score_breakdown[${i}].weighted_value' must be a valid number.`);
        err.statusCode = 502;
        err.code = ErrorCode.INVALID_BRAIN_RESPONSE;
        throw err;
      }
      if (typeof item.status !== 'string' || !item.status.trim()) {
        const err: AppError = new Error(`Brain payload violation: 'score_breakdown[${i}].status' must be a non-empty string.`);
        err.statusCode = 502;
        err.code = ErrorCode.INVALID_BRAIN_RESPONSE;
        throw err;
      }
    }
  }

  // 9. Validate optional delay_trace when present
  if (obj.delay_trace !== undefined && obj.delay_trace !== null) {
    if (!Array.isArray(obj.delay_trace)) {
      const err: AppError = new Error("Brain payload violation: 'delay_trace' must be an array when present.");
      err.statusCode = 502;
      err.code = ErrorCode.INVALID_BRAIN_RESPONSE;
      throw err;
    }

    for (let i = 0; i < obj.delay_trace.length; i++) {
      const item = obj.delay_trace[i];
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        const err: AppError = new Error(`Brain payload violation: 'delay_trace[${i}]' must be an object.`);
        err.statusCode = 502;
        err.code = ErrorCode.INVALID_BRAIN_RESPONSE;
        throw err;
      }
      if (typeof item.train_number !== 'number' || isNaN(item.train_number)) {
        const err: AppError = new Error(`Brain payload violation: 'delay_trace[${i}].train_number' must be a valid number.`);
        err.statusCode = 502;
        err.code = ErrorCode.INVALID_BRAIN_RESPONSE;
        throw err;
      }
      if (typeof item.delay_type !== 'string' || !item.delay_type.trim()) {
        const err: AppError = new Error(`Brain payload violation: 'delay_trace[${i}].delay_type' must be a non-empty string.`);
        err.statusCode = 502;
        err.code = ErrorCode.INVALID_BRAIN_RESPONSE;
        throw err;
      }
      if (typeof item.delay_minutes !== 'number' || isNaN(item.delay_minutes)) {
        const err: AppError = new Error(`Brain payload violation: 'delay_trace[${i}].delay_minutes' must be a valid number.`);
        err.statusCode = 502;
        err.code = ErrorCode.INVALID_BRAIN_RESPONSE;
        throw err;
      }
    }
  }

  // 10. Validate optional recommendations when present
  if (obj.recommendations !== undefined && obj.recommendations !== null) {
    if (!Array.isArray(obj.recommendations)) {
      const err: AppError = new Error("Brain payload violation: 'recommendations' must be an array when present.");
      err.statusCode = 502;
      err.code = ErrorCode.INVALID_BRAIN_RESPONSE;
      throw err;
    }

    for (let i = 0; i < obj.recommendations.length; i++) {
      const item = obj.recommendations[i];
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        const err: AppError = new Error(`Brain payload violation: 'recommendations[${i}]' must be an object.`);
        err.statusCode = 502;
        err.code = ErrorCode.INVALID_BRAIN_RESPONSE;
        throw err;
      }
      if (typeof item.request_id !== 'string' || !item.request_id.trim()) {
        const err: AppError = new Error(`Brain payload violation: 'recommendations[${i}].request_id' must be a non-empty string.`);
        err.statusCode = 502;
        err.code = ErrorCode.INVALID_BRAIN_RESPONSE;
        throw err;
      }
      if (typeof item.status !== 'string' || !item.status.trim()) {
        const err: AppError = new Error(`Brain payload violation: 'recommendations[${i}].status' must be a non-empty string.`);
        err.statusCode = 502;
        err.code = ErrorCode.INVALID_BRAIN_RESPONSE;
        throw err;
      }
      if (item.recommendation !== null && item.recommendation !== undefined) {
        if (typeof item.recommendation !== 'object' || Array.isArray(item.recommendation)) {
          const err: AppError = new Error(`Brain payload violation: 'recommendations[${i}].recommendation' must be an object.`);
          err.statusCode = 502;
          err.code = ErrorCode.INVALID_BRAIN_RESPONSE;
          throw err;
        }
        if (typeof item.recommendation.start !== 'string' || !item.recommendation.start.trim()) {
          const err: AppError = new Error(`Brain payload violation: 'recommendations[${i}].recommendation.start' must be a non-empty string.`);
          err.statusCode = 502;
          err.code = ErrorCode.INVALID_BRAIN_RESPONSE;
          throw err;
        }
        if (typeof item.recommendation.end !== 'string' || !item.recommendation.end.trim()) {
          const err: AppError = new Error(`Brain payload violation: 'recommendations[${i}].recommendation.end' must be a non-empty string.`);
          err.statusCode = 502;
          err.code = ErrorCode.INVALID_BRAIN_RESPONSE;
          throw err;
        }
      }
    }
  }

  // 11. Validate optional bundles when present
  if (obj.bundles !== undefined && obj.bundles !== null) {
    if (!Array.isArray(obj.bundles)) {
      const err: AppError = new Error("Brain payload violation: 'bundles' must be an array when present.");
      err.statusCode = 502;
      err.code = ErrorCode.INVALID_BRAIN_RESPONSE;
      throw err;
    }

    for (let i = 0; i < obj.bundles.length; i++) {
      const b = obj.bundles[i];
      if (!b || typeof b !== 'object' || Array.isArray(b)) {
        const err: AppError = new Error(`Brain payload violation: 'bundles[${i}]' must be an object.`);
        err.statusCode = 502;
        err.code = ErrorCode.INVALID_BRAIN_RESPONSE;
        throw err;
      }
      if (typeof b.bundle_id !== 'string' || !b.bundle_id.trim()) {
        const err: AppError = new Error(`Brain payload violation: 'bundles[${i}].bundle_id' must be a non-empty string.`);
        err.statusCode = 502;
        err.code = ErrorCode.INVALID_BRAIN_RESPONSE;
        throw err;
      }
      if (!Array.isArray(b.request_ids) || b.request_ids.length === 0) {
        const err: AppError = new Error(`Brain payload violation: 'bundles[${i}].request_ids' must be a non-empty array.`);
        err.statusCode = 502;
        err.code = ErrorCode.INVALID_BRAIN_RESPONSE;
        throw err;
      }
      for (let j = 0; j < b.request_ids.length; j++) {
        const reqId = b.request_ids[j];
        if (typeof reqId !== 'string' || !reqId.trim()) {
          const err: AppError = new Error(
            `Brain payload violation: 'bundles[${i}].request_ids[${j}]' must be a non-empty string ID.`
          );
          err.statusCode = 502;
          err.code = ErrorCode.INVALID_BRAIN_RESPONSE;
          throw err;
        }
      }
      if (typeof b.section !== 'string' || !b.section.trim()) {
        const err: AppError = new Error(`Brain payload violation: 'bundles[${i}].section' must be a non-empty string.`);
        err.statusCode = 502;
        err.code = ErrorCode.INVALID_BRAIN_RESPONSE;
        throw err;
      }
      if (typeof b.combined_start !== 'string' || !b.combined_start.trim()) {
        const err: AppError = new Error(`Brain payload violation: 'bundles[${i}].combined_start' must be a non-empty string.`);
        err.statusCode = 502;
        err.code = ErrorCode.INVALID_BRAIN_RESPONSE;
        throw err;
      }
      if (typeof b.combined_end !== 'string' || !b.combined_end.trim()) {
        const err: AppError = new Error(`Brain payload violation: 'bundles[${i}].combined_end' must be a non-empty string.`);
        err.statusCode = 502;
        err.code = ErrorCode.INVALID_BRAIN_RESPONSE;
        throw err;
      }
      if (typeof b.bundle_impact_score !== 'number' || isNaN(b.bundle_impact_score)) {
        const err: AppError = new Error(`Brain payload violation: 'bundles[${i}].bundle_impact_score' must be a valid number.`);
        err.statusCode = 502;
        err.code = ErrorCode.INVALID_BRAIN_RESPONSE;
        throw err;
      }
    }
  }

  // 12. Validate optional metadata when present
  if (obj.metadata !== undefined && obj.metadata !== null) {
    if (typeof obj.metadata !== 'object' || Array.isArray(obj.metadata)) {
      const err: AppError = new Error("Brain payload violation: 'metadata' must be an object when present.");
      err.statusCode = 502;
      err.code = ErrorCode.INVALID_BRAIN_RESPONSE;
      throw err;
    }
    const knownKeys = [
      'request_id', 'brain_run_id', 'trace_id', 'dataset_version',
      'algorithm_version', 'cascade_simulation', 'cascade_reason',
      'candidate_windows_evaluated', 'window_step_minutes', 'plan_version',
      'total_requests_analyzed', 'scoring_version', 'propagation_metric_clarification',
      'version', 'service', 'status'
    ];
    const keys = Object.keys(obj.metadata);
    const hasKnownKey = keys.some((k) => knownKeys.includes(k));
    if (!hasKnownKey && keys.length > 0) {
      const err: AppError = new Error("Brain payload violation: 'metadata' contains no recognized operational fields.");
      err.statusCode = 502;
      err.code = ErrorCode.INVALID_BRAIN_RESPONSE;
      throw err;
    }
    if (obj.metadata.algorithm_version !== undefined && (typeof obj.metadata.algorithm_version !== 'string' || !obj.metadata.algorithm_version.trim())) {
      const err: AppError = new Error("Brain payload violation: 'metadata.algorithm_version' must be a non-empty string.");
      err.statusCode = 502;
      err.code = ErrorCode.INVALID_BRAIN_RESPONSE;
      throw err;
    }
    if (obj.metadata.dataset_version !== undefined && (typeof obj.metadata.dataset_version !== 'string' || !obj.metadata.dataset_version.trim())) {
      const err: AppError = new Error("Brain payload violation: 'metadata.dataset_version' must be a non-empty string.");
      err.statusCode = 502;
      err.code = ErrorCode.INVALID_BRAIN_RESPONSE;
      throw err;
    }
  }

  return {
    success: obj.success,
    request_id: obj.request_id,
    status: obj.status,
    recommendation: validatedRec,
    recommendations: obj.recommendations,
    metrics: obj.metrics,
    overall_metrics: obj.overall_metrics,
    conflicts: obj.conflicts,
    alternatives: obj.alternatives,
    plan_alternatives: obj.plan_alternatives,
    bundles: obj.bundles,
    score_breakdown: obj.score_breakdown,
    delay_trace: obj.delay_trace,
    explanation: typeof obj.explanation === 'string' ? obj.explanation : undefined,
    cascade_status: typeof obj.cascade_status === 'string' ? obj.cascade_status : undefined,
    metadata: obj.metadata,
  };
}
