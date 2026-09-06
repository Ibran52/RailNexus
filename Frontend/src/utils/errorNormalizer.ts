/**
 * errorNormalizer.ts — RailNexus Frontend
 * Centralized error normalization for all API and runtime errors.
 *
 * Usage:
 *   import { normalizeApiError } from '../utils/errorNormalizer';
 *   const { message, code } = normalizeApiError(err);
 *   setError(message);
 */

export interface NormalizedError {
  code: string;
  message: string;
  status?: number;
  fieldErrors?: Record<string, string>;
}

const HTTP_MESSAGE_MAP: Record<number, string> = {
  400: 'Invalid request. Please check your inputs and try again.',
  401: 'Your session has expired. Please log in again.',
  403: 'You do not have permission to perform this action.',
  404: 'The requested resource was not found.',
  409: 'A conflict occurred. This record may already exist.',
  422: 'Validation failed. Please review the highlighted fields.',
  429: 'Too many requests. Please wait a moment before trying again.',
  500: 'An internal server error occurred. Please try again shortly.',
  502: 'Service temporarily unavailable (Bad Gateway). Please try again.',
  503: 'Service is temporarily down for maintenance. Please try again shortly.',
  504: 'Request timed out. The server did not respond in time.',
};

const SPECIFIC_CODE_MESSAGE_MAP: Record<string, string> = {
  IDEMPOTENCY_KEY_OWNERSHIP_VIOLATION: 'Duplicate submission key is already assigned to another user.',
  INVALID_ROLE: 'Invalid role for this registration endpoint.',
  STALE_PLAN: 'This decision is no longer current. Please refresh the request.',
  CONTROLLER_ID_EXISTS: 'This Controller ID is already registered.',
  EMAIL_EXISTS: 'This email address is already registered.',
};


export function normalizeApiError(err: unknown): NormalizedError {
  if (!err) {
    return { code: 'UNKNOWN_ERROR', message: 'An unexpected error occurred.' };
  }

  // Axios error shape
  const axiosErr = err as any;

  // Network failure (no response received)
  if (axiosErr?.code === 'ECONNABORTED' || axiosErr?.code === 'ETIMEDOUT') {
    return {
      code: 'TIMEOUT',
      message: 'Request timed out. Please check your connection and try again.',
      status: undefined,
    };
  }

  if (axiosErr?.message === 'Network Error' || !axiosErr?.response) {
    return {
      code: 'NETWORK_ERROR',
      message: 'Unable to reach RailNexus servers. Please check your network connection.',
      status: undefined,
    };
  }

  const response = axiosErr?.response;
  const status: number | undefined = response?.status;
  const responseBody = response?.data;

  // Structured RailNexus API error shape: { success: false, error: { code, message } }
  const apiCode: string = responseBody?.error?.code || 'API_ERROR';
  const apiMessage: string =
    responseBody?.error?.message || responseBody?.message || '';

  const fieldErrors: Record<string, string> | undefined = responseBody?.error?.fieldErrors;

  // Use API message if informative, else check code map, then HTTP status map
  const finalMessage =
    apiMessage.length > 5
      ? apiMessage
      : SPECIFIC_CODE_MESSAGE_MAP[apiCode] ||
        (status ? HTTP_MESSAGE_MAP[status] : undefined) ||
        'An unexpected error occurred. Please try again.';


  return {
    code: apiCode,
    message: finalMessage,
    status,
    fieldErrors,
  };
}
