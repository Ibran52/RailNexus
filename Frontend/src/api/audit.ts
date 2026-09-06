import { apiClient } from './client';
import { AuditLog } from '../types';

export const auditApi = {
  async getAuditLogs(params?: {
    entityId?: string;
    action?: string;
    limit?: number;
    skip?: number;
  }): Promise<{ total: number; logs: AuditLog[] }> {
    const res = await apiClient.get('/audit', { params });
    return res.data.data;
  },
};
