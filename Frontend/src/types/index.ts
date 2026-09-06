export enum Role {
  MAINTENANCE_ENGINEERING = 'MAINTENANCE_ENGINEERING',
  MAINTENANCE_SNT = 'MAINTENANCE_SNT',
  MAINTENANCE_OHE = 'MAINTENANCE_OHE',
  CONTROLLER = 'CONTROLLER',
  ADMIN = 'ADMIN',
}

export enum Department {
  ENGINEERING = 'ENGINEERING',
  SNT = 'SNT',
  OHE = 'OHE',
  CONTROLLER = 'CONTROLLER',
}

export enum RequestPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export enum RequestStatus {
  PENDING = 'PENDING',
  ANALYZING = 'ANALYZING',
  RECOMMENDED = 'RECOMMENDED',
  APPROVED = 'APPROVED',
  MODIFIED = 'MODIFIED',
  REJECTED = 'REJECTED',
  SCHEDULED = 'SCHEDULED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum ControllerAction {
  APPROVE = 'APPROVE',
  MODIFY = 'MODIFY',
  REJECT = 'REJECT',
}

export type WorkerDepartment = 'Engineering' | 'S&T' | 'OHE' | 'Other';

export type UserRole =
  | 'MAINTENANCE_ENGINEERING'
  | 'MAINTENANCE_SNT'
  | 'MAINTENANCE_OHE'
  | 'CONTROLLER'
  | 'ADMIN';

export function formatDepartment(dept?: Department | WorkerDepartment | string | null): string {
  if (!dept) return 'MISSING DATA';
  const d = String(dept).toUpperCase();
  if (d === 'ENGINEERING') return 'Engineering';
  if (d === 'SNT' || d === 'S&T') return 'S&T';
  if (d === 'OHE') return 'OHE';
  if (d === 'CONTROLLER') return 'Controller';
  return String(dept);
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role | UserRole;
  department: Department | WorkerDepartment | string;
  controllerId?: string;
}

export interface MaintenanceRequest {
  _id: string;
  requestId: string;
  createdBy: string | User;
  department: Department;
  maintenanceType: string;
  fromStation: string;
  toStation: string;
  durationMinutes: number;
  earliestStart: string;
  latestEnd: string;
  priority: RequestPriority;
  description?: string;
  status: RequestStatus;
  currentBrainRunId?: string;
  planningVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface CandidateWindow {
  window_index?: number;
  option_label?: string; // Option A, Option B, etc.
  start: string;
  end: string;
  impact_score: number;
  conflict_count: number;
  direct_delay_minutes: number;
  secondary_delay_minutes?: number;
  total_delay_minutes?: number;
  downstream_delay_minutes?: number;
  priority_trains_affected?: number | string;
  is_recommended?: boolean;
  affected_train_count?: number;
  affected_trains?: Array<{
    train_number: number | string;
    train_type?: string;
    delay_minutes?: number;
    arrival_time?: string;
  }>;
  conflicts?: Array<{
    train_number: number | string;
    train_type?: string;
    conflict_type?: string;
    scheduled_time?: string;
    message?: string;
  }>;
  feasibility?: string;
  speed_restriction_required?: boolean;
  score_breakdown?: Array<{
    factor: string;
    raw_value: any;
    weight: number;
    weighted_value: any;
    status: string;
    source?: string;
    details?: string;
  }>;
  delay_trace?: DelayTraceItem[];
  explanation?: string;
}

export interface DelayTraceItem {
  time?: string;
  timestamp?: string;
  step_minutes?: number;
  event_type?: string;
  train_number?: number | string;
  train_type?: string;
  description: string;
  delay_minutes?: number;
  trace_level?: 'DIRECT' | 'SECONDARY' | 'PROPAGATED' | string;
}

export interface PlanItemRecommendation {
  request_id: string;
  recommendation: CandidateWindow;
  alternatives?: CandidateWindow[];
  metrics?: Record<string, any>;
  conflicts?: any[];
}

export interface BrainRun {
  brainRunId: string;
  requestId: string;
  planningVersion: number;
  planningMode: string;
  datasetVersion?: string;
  algorithmVersion?: string;
  scoringVersion?: string;
  recommendation?: CandidateWindow;
  recommendations?: Array<CandidateWindow | PlanItemRecommendation | any>;
  metrics?: Record<string, any>;
  overallMetrics?: Record<string, any>;
  conflicts?: any[];
  affected_trains?: any[];
  alternatives?: CandidateWindow[];
  scoreBreakdown?: any[];
  delayTrace?: DelayTraceItem[];
  explanation?: string;
  cascadeStatus?: string;
  createdAt: string;
}

export interface ControllerDecision {
  _id: string;
  decisionId: string;
  requestId: string;
  brainRunId: string;
  controllerId: User;
  action: ControllerAction;
  reason: string;
  selectedWindow?: {
    start: string;
    end: string;
  };
  previousPlanVersion?: number;
  newPlanVersion?: number;
  createdAt: string;
}

export interface AuditLog {
  _id: string;
  actorId: User;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string;
  previousState?: Record<string, any>;
  newState?: Record<string, any>;
  brainRunId?: string;
  planningVersion?: number;
  metadata?: Record<string, any>;
  createdAt: string;
}

export interface DatasetStatus {
  status: string;
  dataset: string;
  row_count: number;
  train_count: number;
  station_count: number;
  validation_errors: number;
  validation_warnings: number;
}

export interface CorridorSection {
  from_station: string;
  to_station: string;
  block_section_km?: number;
  avg_duration_mins?: number;
  occupancy_duration_mins?: number;
}

