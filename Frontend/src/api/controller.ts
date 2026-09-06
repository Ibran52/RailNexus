import { apiClient } from './client';
import { BrainRun, ControllerDecision, MaintenanceRequest } from '../types';

export interface DecisionOptions {
  expectedBrainRunId?: string;
  expectedPlanningVersion?: number;
}

export const controllerApi = {
  async getAllRequests(): Promise<MaintenanceRequest[]> {
    const res = await apiClient.get('/controller/requests');
    return res.data.data;
  },

  async getRequestDetails(requestId: string): Promise<{
    request: MaintenanceRequest;
    activeAnalysis?: BrainRun;
    decisions?: ControllerDecision[];
  }> {
    const res = await apiClient.get(`/controller/requests/${requestId}`);
    return res.data.data;
  },

  async getRequestAnalysis(requestId: string): Promise<BrainRun> {
    const res = await apiClient.get(`/controller/requests/${requestId}/analysis`);
    return res.data.data;
  },

  async approveRequest(
    requestId: string,
    reason: string,
    options?: DecisionOptions
  ): Promise<{ decision: ControllerDecision; request: MaintenanceRequest }> {
    const res = await apiClient.post(`/controller/requests/${requestId}/approve`, {
      reason,
      expectedBrainRunId: options?.expectedBrainRunId,
      expectedPlanningVersion: options?.expectedPlanningVersion,
    });
    return res.data.data;
  },

  async modifyRequest(
    requestId: string,
    start: string,
    end: string,
    reason: string,
    options?: DecisionOptions & { modifiedDurationMinutes?: number }
  ): Promise<{ request: MaintenanceRequest; brainRun: BrainRun }> {
    const res = await apiClient.post(`/controller/requests/${requestId}/modify`, {
      start,
      end,
      reason,
      modifiedDurationMinutes: options?.modifiedDurationMinutes,
      expectedBrainRunId: options?.expectedBrainRunId,
      expectedPlanningVersion: options?.expectedPlanningVersion,
    });
    return res.data.data;
  },

  async rejectRequest(
    requestId: string,
    reason: string,
    options?: DecisionOptions
  ): Promise<{ decision: ControllerDecision; request: MaintenanceRequest }> {
    const res = await apiClient.post(`/controller/requests/${requestId}/reject`, {
      reason,
      expectedBrainRunId: options?.expectedBrainRunId,
      expectedPlanningVersion: options?.expectedPlanningVersion,
    });
    return res.data.data;
  },

  async runWhatIf(
    requestId: string,
    proposedStart?: string,
    proposedEnd?: string,
    overrides?: Record<string, any>
  ): Promise<any> {
    const res = await apiClient.post('/controller/what-if', {
      requestId,
      proposedStart,
      proposedEnd,
      overrides,
    });
    return res.data.data;
  },

  async getHistory(): Promise<{
    decisions: ControllerDecision[];
    recentRuns: BrainRun[];
  }> {
    const res = await apiClient.get('/controller/history');
    return res.data.data;
  },
};
