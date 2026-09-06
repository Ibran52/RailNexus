/**
 * PlanningStateCounter.ts — RailNexus Backend
 * Persistent monotonic counter for global railway maintenance planning state versioning.
 */

import mongoose, { Schema, Document } from 'mongoose';

export interface IPlanningStateCounter extends Document {
  singletonKey: string;
  currentVersion: number;
  updatedAt: Date;
}

const PlanningStateCounterSchema = new Schema<IPlanningStateCounter>(
  {
    singletonKey: {
      type: String,
      required: true,
      unique: true,
      default: 'GLOBAL_PLANNING_STATE',
    },
    currentVersion: {
      type: Number,
      required: true,
      default: 1,
    },
  },
  {
    timestamps: true,
  }
);

export const PlanningStateCounter = mongoose.model<IPlanningStateCounter>(
  'PlanningStateCounter',
  PlanningStateCounterSchema
);

/**
 * Atomically increments the monotonic planning version and returns the new integer version.
 * NOTE (Monotonic vs Gapless Invariant):
 * The counter guarantees strict monotonic ordering (V_new > V_prev).
 * Under concurrent decisions where a losing decision fails its atomic conditional update,
 * the version assigned to that failed attempt may remain unused. This numeric gap is
 * architecturally expected and safe — the system invariant is strict monotonicity, not gaplessness.
 */
export async function incrementPlanningVersion(): Promise<number> {
  const counter = await PlanningStateCounter.findOneAndUpdate(
    { singletonKey: 'GLOBAL_PLANNING_STATE' },
    { $inc: { currentVersion: 1 } },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  );
  return counter!.currentVersion;
}

/**
 * Retrieves current monotonic planning version without incrementing.
 */
export async function getCurrentPlanningVersion(): Promise<number> {
  const counter = await PlanningStateCounter.findOne({ singletonKey: 'GLOBAL_PLANNING_STATE' });
  return counter ? counter.currentVersion : 1;
}
