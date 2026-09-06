/**
 * RefreshSession.ts — RailNexus Backend
 * Persistent refresh token session tracking with hash-only storage, rotation, and reuse detection.
 */

import mongoose, { Schema, Document } from 'mongoose';

export interface IRefreshSession extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedByTokenHash: string | null;
  lastUsedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const RefreshSessionSchema = new Schema<IRefreshSession>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true,
    },
    tokenHash: {
      type: String,
      required: [true, 'Token hash is required'],
      unique: true,
      index: true,
    },
    expiresAt: {
      type: Date,
      required: [true, 'Expiration date is required'],
      index: true,
    },
    revokedAt: {
      type: Date,
      default: null,
      index: true,
    },
    replacedByTokenHash: {
      type: String,
      default: null,
    },
    lastUsedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for querying active sessions for a user
RefreshSessionSchema.index({ userId: 1, revokedAt: 1 });

export const RefreshSession = mongoose.model<IRefreshSession>('RefreshSession', RefreshSessionSchema);
