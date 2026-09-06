/**
 * BrainRun.ts — RailNexus Backend
 * Complete immutable persistence record of a Python Brain simulation/optimization execution.
 */

import mongoose, { Schema, Document } from 'mongoose';
import { PlanningMode } from '../config/constants';

export interface IBrainRun extends Document {
  _id: mongoose.Types.ObjectId;
  brainRunId: string;
  requestId: string;
  planningVersion: number;
  planningMode: PlanningMode;
  datasetVersion?: string;
  algorithmVersion?: string;
  scoringVersion?: string;
  recommendation: Record<string, any>;
  recommendations: Record<string, any>[];
  metrics: Record<string, any>;
  overallMetrics?: Record<string, any>;
  conflicts: Record<string, any>[];
  alternatives: Record<string, any>[];
  planAlternatives?: Record<string, any>[];
  bundles?: Record<string, any>[];
  scoreBreakdown?: Record<string, any>[];
  delayTrace?: Record<string, any>[];
  explanation?: string;
  cascadeStatus?: string;
  createdAt: Date;
  updatedAt: Date;
}

const BrainRunSchema = new Schema<IBrainRun>(
  {
    brainRunId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    requestId: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    planningVersion: {
      type: Number,
      required: true,
      index: true,
    },
    planningMode: {
      type: String,
      enum: Object.values(PlanningMode),
      required: true,
    },
    datasetVersion: {
      type: String,
      trim: true,
    },
    algorithmVersion: {
      type: String,
      trim: true,
    },
    scoringVersion: {
      type: String,
      trim: true,
    },
    recommendation: {
      type: Schema.Types.Mixed,
      default: {},
    },
    recommendations: {
      type: Array as any,
      default: [],
    },
    metrics: {
      type: Schema.Types.Mixed,
      default: {},
    },
    overallMetrics: {
      type: Schema.Types.Mixed,
    },
    conflicts: {
      type: Array as any,
      default: [],
    },
    alternatives: {
      type: Array as any,
      default: [],
    },
    planAlternatives: {
      type: Array as any,
      default: [],
    },
    bundles: {
      type: Array as any,
      default: [],
    },
    scoreBreakdown: {
      type: Array as any,
      default: [],
    },
    delayTrace: {
      type: [Schema.Types.Mixed],
      default: [],
    },
    explanation: {
      type: String,
      trim: true,
    },
    cascadeStatus: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

BrainRunSchema.index({ requestId: 1, createdAt: -1 });

export const BrainRun = mongoose.model<IBrainRun>('BrainRun', BrainRunSchema);
