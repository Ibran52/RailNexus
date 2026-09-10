/**
 * MaintenanceRequest.ts — RailNexus Backend
 * Railway track block / maintenance work order request.
 */

import mongoose, { Schema, Document } from 'mongoose';
import { Department, RequestPriority, RequestStatus } from '../config/constants';

export interface IMaintenanceRequest extends Document {
  _id: mongoose.Types.ObjectId;
  requestId: string;
  createdBy: mongoose.Types.ObjectId;
  submitterName?: string;
  department: Department | string;
  maintenanceType: string;
  fromStation: string;
  toStation: string;
  durationMinutes: number;
  earliestStart: Date;
  latestEnd: Date;
  priority: RequestPriority;
  description?: string;
  status: RequestStatus;
  currentBrainRunId?: string;
  idempotencyKey?: string;
  planningVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

const MaintenanceRequestSchema = new Schema<IMaintenanceRequest>(
  {
    requestId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    department: {
      type: String,
      required: true,
      index: true,
    },
    maintenanceType: {
      type: String,
      required: [true, 'Maintenance type is required'],
      trim: true,
    },
    fromStation: {
      type: String,
      required: [true, 'fromStation is required'],
      trim: true,
      uppercase: true,
    },
    toStation: {
      type: String,
      required: [true, 'toStation is required'],
      trim: true,
      uppercase: true,
    },
    durationMinutes: {
      type: Number,
      required: [true, 'durationMinutes is required'],
      min: [1, 'Duration must be at least 1 minute'],
    },
    earliestStart: {
      type: Date,
      required: [true, 'earliestStart is required'],
    },
    latestEnd: {
      type: Date,
      required: [true, 'latestEnd is required'],
    },
    priority: {
      type: String,
      enum: Object.values(RequestPriority),
      default: RequestPriority.MEDIUM,
      required: true,
    },
    description: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: Object.values(RequestStatus),
      default: RequestStatus.PENDING,
      required: true,
      index: true,
    },
    currentBrainRunId: {
      type: String,
      trim: true,
    },
    idempotencyKey: {
      type: String,
      index: { unique: true, sparse: true },
      trim: true,
    },
    planningVersion: {
      type: Number,
      default: 1,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

MaintenanceRequestSchema.index({ department: 1, status: 1 });
MaintenanceRequestSchema.index({ createdAt: -1 });

export const MaintenanceRequest = mongoose.model<IMaintenanceRequest>(
  'MaintenanceRequest',
  MaintenanceRequestSchema
);
