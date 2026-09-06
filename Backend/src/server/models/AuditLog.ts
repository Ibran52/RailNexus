/**
 * AuditLog.ts — RailNexus Backend
 * Append-only security and operational audit trail.
 */

import mongoose, { Schema, Document } from 'mongoose';
import { AuditAction } from '../config/constants';

export interface IAuditLog extends Document {
  _id: mongoose.Types.ObjectId;
  actorId: mongoose.Types.ObjectId;
  actorRole: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  previousState?: Record<string, any>;
  newState?: Record<string, any>;
  brainRunId?: string;
  planningVersion?: number;
  metadata?: Record<string, any>;
  createdAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    actorId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    actorRole: {
      type: String,
      required: true,
    },
    action: {
      type: String,
      enum: Object.values(AuditAction),
      required: true,
      index: true,
    },
    entityType: {
      type: String,
      required: true,
      default: 'MAINTENANCE_REQUEST',
    },
    entityId: {
      type: String,
      required: true,
      index: true,
    },
    previousState: {
      type: Schema.Types.Mixed,
    },
    newState: {
      type: Schema.Types.Mixed,
    },
    brainRunId: {
      type: String,
    },
    planningVersion: {
      type: Number,
    },
    metadata: {
      type: Schema.Types.Mixed,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, // append-only
  }
);

AuditLogSchema.index({ entityId: 1, createdAt: -1 });

export const AuditLog = mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);
