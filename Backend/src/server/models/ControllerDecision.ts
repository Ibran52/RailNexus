/**
 * ControllerDecision.ts — RailNexus Backend
 * Append-only historical record of controller actions (Approve, Modify, Reject).
 */

import mongoose, { Schema, Document } from 'mongoose';
import { ControllerAction } from '../config/constants';

export interface IControllerDecision extends Document {
  _id: mongoose.Types.ObjectId;
  decisionId: string;
  requestId: string;
  brainRunId: string;
  controllerId: mongoose.Types.ObjectId;
  action: ControllerAction;
  reason: string;
  selectedWindow?: {
    start: Date;
    end: Date;
  };
  previousPlanVersion?: number;
  newPlanVersion?: number;
  createdAt: Date;
}

const ControllerDecisionSchema = new Schema<IControllerDecision>(
  {
    decisionId: {
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
    brainRunId: {
      type: String,
      required: true,
      trim: true,
    },
    controllerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    action: {
      type: String,
      enum: Object.values(ControllerAction),
      required: true,
    },
    reason: {
      type: String,
      required: [true, 'Decision reason is required'],
      trim: true,
    },
    selectedWindow: {
      start: { type: Date },
      end: { type: Date },
    },
    previousPlanVersion: {
      type: Number,
    },
    newPlanVersion: {
      type: Number,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, // append-only
  }
);

ControllerDecisionSchema.index({ requestId: 1, createdAt: -1 });

export const ControllerDecision = mongoose.model<IControllerDecision>(
  'ControllerDecision',
  ControllerDecisionSchema
);
