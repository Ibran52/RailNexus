/**
 * validation.ts — RailNexus Backend
 * Input validation and NoSQL sanitization middleware.
 */

import { Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import { ErrorCode, RequestPriority } from '../config/constants';

/**
 * Sanitizes object keys recursively against MongoDB $ operator injections.
 */
export function sanitizeNoSql(req: Request, _res: Response, next: NextFunction): void {
  const sanitize = (obj: any): any => {
    if (!obj || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(sanitize);

    const clean: Record<string, any> = {};
    for (const key of Object.keys(obj)) {
      if (key.startsWith('$')) {
        continue; // Strip MongoDB operators
      }
      clean[key] = sanitize(obj[key]);
    }
    return clean;
  };

  if (req.body) req.body = sanitize(req.body);
  if (req.query) req.query = sanitize(req.query);
  if (req.params) req.params = sanitize(req.params);

  next();
}

/**
 * Checks express-validator results and returns standard 400 response on failure.
 */
export function handleValidationErrors(req: Request, res: Response, next: NextFunction): void {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({
      success: false,
      error: {
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Validation failed on submitted payload.',
        details: errors.array(),
      },
    });
    return;
  }
  next();
}

/**
 * Validation rules for POST /api/v1/maintenance/requests
 */
export const validateCreateRequest = [
  body('maintenanceType')
    .trim()
    .notEmpty()
    .withMessage('maintenanceType is required'),
  body('fromStation')
    .trim()
    .notEmpty()
    .withMessage('fromStation is required')
    .toUpperCase(),
  body('toStation')
    .trim()
    .notEmpty()
    .withMessage('toStation is required')
    .toUpperCase()
    .custom((toStation, { req }) => {
      if (toStation === req.body.fromStation) {
        throw new Error('fromStation and toStation cannot be identical.');
      }
      return true;
    }),
  body('durationMinutes')
    .isInt({ min: 1 })
    .withMessage('durationMinutes must be a positive integer greater than 0'),
  body('earliestStart')
    .isISO8601()
    .withMessage('earliestStart must be a valid ISO 8601 timestamp'),
  body('latestEnd')
    .isISO8601()
    .withMessage('latestEnd must be a valid ISO 8601 timestamp')
    .custom((latestEnd, { req }) => {
      const start = new Date(req.body.earliestStart).getTime();
      const end = new Date(latestEnd).getTime();
      if (end <= start) {
        throw new Error('latestEnd must be strictly after earliestStart.');
      }
      const durationMs = (parseInt(req.body.durationMinutes, 10) || 0) * 60 * 1000;
      if (end - start < durationMs) {
        throw new Error('Time window [earliestStart, latestEnd] is shorter than required durationMinutes.');
      }
      return true;
    }),
  body('priority')
    .optional()
    .isIn(Object.values(RequestPriority))
    .withMessage(`priority must be one of: ${Object.values(RequestPriority).join(', ')}`),
  body('description')
    .optional()
    .isString()
    .trim(),
  handleValidationErrors,
];

/**
 * Validation rules for POST /api/v1/controller/requests/:requestId/modify
 */
export const validateModifyRequest = [
  body('start')
    .optional()
    .isISO8601()
    .withMessage('start must be a valid ISO 8601 timestamp'),
  body('end')
    .optional()
    .isISO8601()
    .withMessage('end must be a valid ISO 8601 timestamp')
    .custom((end, { req }) => {
      if (req.body.start && end) {
        const startTime = new Date(req.body.start).getTime();
        const endTime = new Date(end).getTime();
        if (endTime <= startTime) {
          throw new Error('end must be strictly after start.');
        }
      }
      return true;
    }),
  body('reason')
    .trim()
    .notEmpty()
    .withMessage('Modification reason is required'),
  handleValidationErrors,
];

/**
 * Validation rules for Decision actions (Approve, Reject)
 */
export const validateDecisionReason = [
  body('reason')
    .trim()
    .notEmpty()
    .withMessage('Reason is required for this operational decision'),
  handleValidationErrors,
];

/**
 * Validation rules for What-If Analysis
 */
export const validateWhatIfRequest = [
  body('requestId')
    .trim()
    .notEmpty()
    .withMessage('requestId is required'),
  body('proposedStart')
    .optional()
    .isISO8601()
    .withMessage('proposedStart must be a valid ISO 8601 timestamp'),
  body('proposedEnd')
    .optional()
    .isISO8601()
    .withMessage('proposedEnd must be a valid ISO 8601 timestamp')
    .custom((end, { req }) => {
      if (req.body.proposedStart && end) {
        const start = new Date(req.body.proposedStart).getTime();
        const endTime = new Date(end).getTime();
        if (endTime <= start) {
          throw new Error('proposedEnd must be strictly after proposedStart.');
        }
      }
      return true;
    }),
  handleValidationErrors,
];
