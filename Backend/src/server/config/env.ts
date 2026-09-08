/**
 * env.ts — RailNexus Backend
 * Validates and exposes typed environment configuration.
 * Fails fast immediately if required variables are missing.
 */

import dotenv from 'dotenv';
dotenv.config();

export interface EnvConfig {
  NODE_ENV: string;
  PORT: number;
  MONGO_URI: string;
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
  REFRESH_TOKEN_SECRET: string;
  REFRESH_TOKEN_EXPIRY: string;
  BRAIN_SERVICE_URL: string;
  BRAIN_TIMEOUT_MS: number;
  CORS_ORIGIN: string;
}

function validateEnv(): EnvConfig {
  const NODE_ENV = process.env.NODE_ENV || 'development';
  const isProduction = NODE_ENV === 'production';
  const MONGO_URI = process.env.MONGO_URI?.trim();
  if (!MONGO_URI) {
    console.error('FATAL: MONGO_URI environment variable is missing or empty. RailNexus backend cannot start without MongoDB Atlas persistence.');
    process.exit(1);
  }

  const JWT_SECRET = process.env.JWT_SECRET?.trim();
  if (!JWT_SECRET) {
    console.error('FATAL: JWT_SECRET environment variable is missing or empty. RailNexus backend cannot start without a secure JWT secret.');
    process.exit(1);
  }

  const REFRESH_TOKEN_SECRET =
    process.env.REFRESH_TOKEN_SECRET?.trim() ||
    (process.env.NODE_ENV === 'production' ? '' : '8f5db96b825cfb3e70cfd0f59ab44c9b13eeef524e93aa89945c73d9d37bbfae');
  if (!REFRESH_TOKEN_SECRET) {
    console.error('FATAL: REFRESH_TOKEN_SECRET environment variable is missing or empty. RailNexus backend cannot start without a secure refresh token secret.');
    process.exit(1);
  }

  const PORT = parseInt(process.env.PORT || '5000', 10);
  const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';
  const REFRESH_TOKEN_EXPIRY = process.env.REFRESH_TOKEN_EXPIRY || '10d';
  const BRAIN_SERVICE_URL = (process.env.BRAIN_SERVICE_URL || (isProduction ? '' : 'http://localhost:8000')).replace(/\/+$/, '');
  if (!BRAIN_SERVICE_URL) {
    console.error('FATAL: BRAIN_SERVICE_URL is required in production.');
    process.exit(1);
  }
  const BRAIN_TIMEOUT_MS = parseInt(process.env.BRAIN_TIMEOUT_MS || '30000', 10);
  const CORS_ORIGIN = process.env.CORS_ORIGIN || (isProduction ? '' : 'http://localhost:3000');
  if (!CORS_ORIGIN) {
    console.error('FATAL: CORS_ORIGIN is required in production.');
    process.exit(1);
  }

  return {
    NODE_ENV,
    PORT,
    MONGO_URI,
    JWT_SECRET,
    JWT_EXPIRES_IN,
    REFRESH_TOKEN_SECRET,
    REFRESH_TOKEN_EXPIRY,
    BRAIN_SERVICE_URL,
    BRAIN_TIMEOUT_MS,
    CORS_ORIGIN,
  };
}

export const env = validateEnv();
