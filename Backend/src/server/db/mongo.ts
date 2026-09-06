/**
 * mongo.ts — RailNexus Backend
 * Strict MongoDB Atlas database connector.
 * Fails fast if connection cannot be established.
 */

import dns from 'node:dns';
import mongoose from 'mongoose';
import { env } from '../config/env.js';

// Resolve MongoDB Atlas SRV records reliably on Windows/local networks
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch {
  // Ignore in restricted environments
}

export async function connectDB(): Promise<void> {
  try {
    console.log('Connecting to MongoDB Atlas...');
    await mongoose.connect(env.MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
    });
    console.log('Connected successfully to MongoDB Atlas.');
  } catch (error: any) {
    console.error(`FATAL: Failed to connect to MongoDB Atlas: ${error.message}`);
    process.exit(1);
  }
}

export async function closeDB(): Promise<void> {
  await mongoose.disconnect();
}

export const disconnectDB = closeDB;
