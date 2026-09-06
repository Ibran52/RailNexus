/**
 * errorHandler.ts — RailNexus Backend
 * Centralized error handler returning consistent standardized JSON responses.
 */

import { Request, Response, NextFunction } from 'express';
import { ErrorCode } from '../config/constants';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
  details?: any;
}

export function errorHandler(
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = err.statusCode || 500;
  const errorCode = err.code || ErrorCode.INTERNAL_SERVER_ERROR;
  const message = err.message || 'An unexpected internal server error occurred.';

  // Log error internally for operational diagnostics with structured context
  if (statusCode >= 500) {
    console.error(
      JSON.stringify({
        level: 'ERROR',
        errorCode,
        message: err.message,
        statusCode,
        method: _req.method,
        path: _req.path,
        stack: err.stack,
        timestamp: new Date().toISOString(),
      })
    );
  }


  // Sanitize 500 internal server errors for clients (P0/Phase 10: Never expose database or internal stack traces)
  let clientMessage = message;
  if (statusCode >= 500) {
    clientMessage = 'An unexpected internal server error occurred. Please contact system operations.';
  }

  res.status(statusCode).json({
    success: false,
    error: {
      code: errorCode,
      message: clientMessage,
      ...(err.details && statusCode < 500 ? { details: err.details } : {}),
    },
  });
}
