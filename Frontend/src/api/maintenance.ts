import { apiClient } from './client';
import { BrainRun, MaintenanceRequest, RequestPriority } from '../types';

export interface CreateRequestPayload {
  maintenanceType: string;
  fromStation: string;
  toStation: string;
  durationMinutes: number;
  earliestStart: string;
  latestEnd: string;
  priority?: RequestPriority;
  description?: string;
  idempotencyKey?: string;
}

/**
 * Generates a RFC 4122 v4-compliant UUID for idempotency key generation.
 * Used as a client-side fallback when the caller does not supply a key.
 */
function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export const maintenanceApi = {
  async createRequest(payload: CreateRequestPayload): Promise<{
    success: boolean;
    data: {
      request: MaintenanceRequest;
      brainRun?: BrainRun;
      isDuplicate?: boolean;
    };
  }> {
    // Always ensure an idempotency key is sent — generate one if caller did not provide it.
    const idempotencyKey = payload.idempotencyKey || generateUUID();

    const res = await apiClient.post('/maintenance/requests', payload, {
      headers: { 'Idempotency-Key': idempotencyKey },
    });
    return res.data;
  },

  async getRequests(): Promise<MaintenanceRequest[]> {
    const res = await apiClient.get('/maintenance/requests');
    if (Array.isArray(res.data?.data?.requests)) {
      return res.data.data.requests;
    }
    if (Array.isArray(res.data?.data)) {
      return res.data.data;
    }
    return [];
  },

  async getRequest(requestId: string): Promise<{
    request: MaintenanceRequest;
    activeAnalysis?: BrainRun;
    brainRun?: BrainRun;
    decision?: any;
  }> {
    const res = await apiClient.get(`/maintenance/requests/${requestId}`);
    return res.data.data;
  },

  async getRequestAnalysis(requestId: string): Promise<BrainRun> {
    const res = await apiClient.get(`/maintenance/requests/${requestId}/analysis`);
    return res.data.data;
  },
};
