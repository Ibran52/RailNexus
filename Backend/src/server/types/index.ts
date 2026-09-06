/**
 * index.ts — RailNexus Backend
 * Global TypeScript interfaces and Brain microservice JSON contracts.
 */

import { BrainPlanningRequestStatus, Department, PlanningMode, RequestPriority, RequestStatus, Role } from '../config/constants';

export interface AuthTokenPayload {
  sub: string;
  email: string;
  role: Role;
  department: Department;
  controllerId?: string;
}

export interface BrainPendingRequestItem {
  request_id: string;
  from_station: string;
  to_station: string;
  duration_minutes: number;
  earliest_start: string;
  latest_end: string;
  priority?: string;
  status?: BrainPlanningRequestStatus | RequestStatus | string;
}

export interface BrainFixedPlanItem {
  request_id: string;
  from_station: string;
  to_station: string;
  allocated_start: string;
  allocated_end: string;
  status: BrainPlanningRequestStatus | RequestStatus | string;
}

export interface BrainPlanningState {
  version: number;
  planning_mode: PlanningMode;
  pending_requests: BrainPendingRequestItem[];
  fixed_plans: BrainFixedPlanItem[];
}

export interface BrainAnalyzeRequest {
  request_id: string;
  from_station: string;
  to_station: string;
  duration_minutes: number;
  earliest_start: string;
  latest_end: string;
  priority?: string;
  planning_state?: BrainPlanningState;
}

export interface BrainScoreBreakdownItem {
  factor: string;
  raw_value: number;
  weight: number;
  weighted_value: number;
  status: string;
  source: string;
  details?: string;
}

export interface BrainRecommendation {
  start: string;
  end: string;
  impact_score: number;
  score_breakdown?: BrainScoreBreakdownItem[];
}

export interface BrainAnalyzeResponse {
  success: boolean;
  request_id: string;
  status?: string;
  brain_run_id?: string;
  recommendation: BrainRecommendation | null;
  recommendations?: any[];
  metrics: Record<string, any>;
  overall_metrics?: Record<string, any>;
  conflicts: any[];
  alternatives: any[];
  plan_alternatives?: any[];
  bundles?: any[];
  score_breakdown?: BrainScoreBreakdownItem[];
  delay_trace?: any[];
  explanation?: string;
  cascade_status?: string;
  metadata?: {
    service?: string;
    version?: string;
    algorithm_version?: string;
    scoring_version?: string;
  };
}

export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

declare global {
  namespace Express {
    interface Request {
      cookies?: Record<string, string>;
    }
  }
}

