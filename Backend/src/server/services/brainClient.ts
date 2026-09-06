/**
 * brainClient.ts — RailNexus Backend
 * HTTP client for orchestrating Python Brain simulation & optimization API calls.
 */

import axios, { AxiosInstance } from 'axios';
import { env } from '../config/env';
import { ErrorCode } from '../config/constants';
import { BrainAnalyzeRequest, BrainAnalyzeResponse } from '../types';
import { AppError } from '../middleware/errorHandler';
import { validateBrainResponse } from './brainValidator';
import { normalizePlanningStateForBrain } from './planningService';

class BrainClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: env.BRAIN_SERVICE_URL,
      timeout: env.BRAIN_TIMEOUT_MS,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  getClient(): AxiosInstance {
    return this.client;
  }

  /**
   * Invokes Python Brain window analysis and cascade conflict simulation.
   */
  async analyzeMaintenanceWindow(payload: BrainAnalyzeRequest): Promise<BrainAnalyzeResponse> {
    try {
      const outboundPayload: BrainAnalyzeRequest = payload.planning_state
        ? {
            ...payload,
            planning_state: normalizePlanningStateForBrain(payload.planning_state),
          }
        : payload;

      const response = await this.client.post(
        '/api/v1/brain/analyze',
        outboundPayload
      );

      return validateBrainResponse(response.data);
    } catch (error: any) {
      if (error.code && Object.values(ErrorCode).includes(error.code)) {
        throw error;
      }

      if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        const err: AppError = new Error(
          `Brain simulation timed out after ${env.BRAIN_TIMEOUT_MS}ms.`
        );
        err.statusCode = 504;
        err.code = ErrorCode.BRAIN_TIMEOUT;
        throw err;
      }

      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        const err: AppError = new Error(
          `Python Brain microservice is unavailable at ${env.BRAIN_SERVICE_URL}.`
        );
        err.statusCode = 503;
        err.code = ErrorCode.BRAIN_UNAVAILABLE;
        throw err;
      }

      if (error.response) {
        const brainError = error.response.data?.detail || error.response.data?.error || error.message;
        const err: AppError = new Error(`Brain rejected request: ${JSON.stringify(brainError)}`);
        err.statusCode = error.response.status >= 500 ? 502 : error.response.status;
        err.code = ErrorCode.BRAIN_INVALID_RESPONSE;
        err.details = error.response.data;
        throw err;
      }

      const err: AppError = new Error(`Brain execution failed: ${error.message}`);
      err.statusCode = 503;
      err.code = ErrorCode.BRAIN_UNAVAILABLE;
      throw err;
    }
  }

  /**
   * Health probe to verify Brain microservice connectivity.
   */
  async checkBrainHealth(): Promise<{ status: string; url: string; details?: any }> {
    try {
      const resp = await this.client.get('/api/v1/brain/health');
      return { status: 'ok', url: env.BRAIN_SERVICE_URL, details: resp.data };
    } catch (error: any) {
      return {
        status: 'unreachable',
        url: env.BRAIN_SERVICE_URL,
        details: error.message,
      };
    }
  }

  /**
   * Proxies dataset status information from the Brain microservice.
   */
  async getDataStatus(): Promise<any> {
    try {
      const resp = await this.client.get('/api/v1/brain/data-status');
      return resp.data;
    } catch (error: any) {
      const err: AppError = new Error(
        `Failed to retrieve dataset status from Brain: ${error.message}`
      );
      err.statusCode = 503;
      err.code = ErrorCode.BRAIN_UNAVAILABLE;
      throw err;
    }
  }

  /**
   * Retrieves verified station codes from the Brain microservice.
   */
  async getStations(): Promise<string[]> {
    try {
      const resp = await this.client.get('/api/v1/brain/stations');
      return resp.data;
    } catch (error: any) {
      const err: AppError = new Error(
        `Failed to retrieve stations from Brain: ${error.message}`
      );
      err.statusCode = 503;
      err.code = ErrorCode.BRAIN_UNAVAILABLE;
      throw err;
    }
  }

  /**
   * Retrieves verified corridor block sections from the Brain microservice.
   */
  async getSections(): Promise<any[]> {
    try {
      const resp = await this.client.get('/api/v1/brain/sections');
      return resp.data;
    } catch (error: any) {
      const err: AppError = new Error(
        `Failed to retrieve sections from Brain: ${error.message}`
      );
      err.statusCode = 503;
      err.code = ErrorCode.BRAIN_UNAVAILABLE;
      throw err;
    }
  }
}

export const brainClient = new BrainClient();

