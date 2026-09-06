import { apiClient } from './client';
import { CorridorSection, DatasetStatus } from '../types';

export const brainApi = {
  async checkHealth(): Promise<{ status: string; url: string; details?: any }> {
    const res = await apiClient.get('/brain/health');
    return res.data.data;
  },

  async getDataStatus(): Promise<DatasetStatus> {
    const res = await apiClient.get('/brain/data-status');
    return res.data.data;
  },

  async getStations(): Promise<string[]> {
    const res = await apiClient.get('/brain/stations');
    return res.data.data;
  },

  async getSections(): Promise<CorridorSection[]> {
    const res = await apiClient.get('/brain/sections');
    return res.data.data;
  },
};
