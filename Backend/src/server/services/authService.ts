/**
 * authService.ts — RailNexus Backend
 * Refresh token lifecycle management: generation, cryptographic hashing, session storage,
 * rotation, reuse detection, and session revocation.
 */

import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { User, IUser } from '../models/User';
import { RefreshSession, IRefreshSession } from '../models/RefreshSession';
import { AuthTokenPayload } from '../types';
import { ErrorCode } from '../config/constants';

export const REFRESH_COOKIE_NAME = 'refreshToken';

export class AuthError extends Error {
  public code: ErrorCode;
  public statusCode: number;

  constructor(code: ErrorCode, message: string, statusCode = 401) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

/**
 * Deterministic SHA-256 hash of raw refresh token.
 * Raw refresh tokens must NEVER be stored in the database.
 */
export function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken.trim()).digest('hex');
}

/**
 * Returns secure cookie options for refresh token.
 */
export function getRefreshCookieOptions(expiresAt?: Date) {
  const isProd = env.NODE_ENV === 'production';
  const maxAge = expiresAt
    ? Math.max(0, expiresAt.getTime() - Date.now())
    : 10 * 24 * 60 * 60 * 1000;

  return {
    httpOnly: true,
    secure: isProd,
    sameSite: (isProd ? 'none' : 'lax') as 'none' | 'lax',
    maxAge,
    path: '/',
  };
}

/**
 * Returns options for clearing the refresh token cookie.
 */
export function getClearCookieOptions() {
  const isProd = env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: (isProd ? 'none' : 'lax') as 'none' | 'lax',
    path: '/',
  };
}

/**
 * Generates a short-lived access token (default 15m).
 */
export function generateAccessToken(user: IUser): string {
  const payload: AuthTokenPayload = {
    sub: user._id.toString(),
    email: user.email,
    role: user.role,
    department: user.department as any,
    ...(user.controllerId ? { controllerId: user.controllerId } : {}),
  };

  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as any,
  });
}

/**
 * Generates a long-lived refresh token signed with REFRESH_TOKEN_SECRET.
 */
export function generateRefreshToken(userId: string): { token: string; expiresAt: Date } {
  const jti = crypto.randomBytes(16).toString('hex');
  const token = jwt.sign(
    { sub: userId, type: 'refresh', jti },
    env.REFRESH_TOKEN_SECRET,
    { expiresIn: env.REFRESH_TOKEN_EXPIRY as any }
  );

  const decoded = jwt.decode(token) as { exp?: number };
  const expiresAt = decoded?.exp
    ? new Date(decoded.exp * 1000)
    : new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);

  return { token, expiresAt };
}

/**
 * Creates and persists a new refresh session with token hash only.
 */
export async function createRefreshSession(
  userId: string,
  rawToken: string,
  expiresAt: Date
): Promise<IRefreshSession> {
  const tokenHash = hashToken(rawToken);
  return await RefreshSession.create({
    userId,
    tokenHash,
    expiresAt,
    revokedAt: null,
    replacedByTokenHash: null,
    lastUsedAt: new Date(),
  });
}

/**
 * Validates, rotates old refresh token, detects reuse, and issues new token pair.
 */
export async function rotateRefreshToken(rawToken: string): Promise<{
  accessToken: string;
  newRefreshToken: string;
  newExpiresAt: Date;
  user: IUser;
}> {
  if (!rawToken || typeof rawToken !== 'string' || !rawToken.trim()) {
    throw new AuthError(ErrorCode.UNAUTHORIZED, 'Refresh token is required.');
  }

  let decoded: { sub?: string; type?: string };
  try {
    decoded = jwt.verify(rawToken.trim(), env.REFRESH_TOKEN_SECRET) as { sub?: string; type?: string };
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      throw new AuthError(ErrorCode.UNAUTHORIZED, 'Refresh token has expired. Please log in again.');
    }
    throw new AuthError(ErrorCode.UNAUTHORIZED, 'Invalid or malformed refresh token.');
  }

  if (decoded.type !== 'refresh' || !decoded.sub) {
    throw new AuthError(ErrorCode.UNAUTHORIZED, 'Invalid refresh token payload.');
  }

  const tokenHash = hashToken(rawToken);

  // ATOMIC CONDITIONAL MUTATION:
  // Find an unrevoked session matching tokenHash and atomically mark it as revoked.
  // This guarantees that exactly ONE concurrent request succeeds.
  const session = await RefreshSession.findOneAndUpdate(
    { tokenHash, revokedAt: null },
    { $set: { revokedAt: new Date(), lastUsedAt: new Date() } },
    { returnDocument: 'before' }
  );

  if (!session) {
    // Check if session exists but was already revoked -> reuse breach detection
    const existingRevoked = await RefreshSession.findOne({ tokenHash });
    if (existingRevoked && existingRevoked.revokedAt) {
      await RefreshSession.updateMany(
        { userId: existingRevoked.userId, revokedAt: null },
        { $set: { revokedAt: new Date() } }
      );
      throw new AuthError(
        ErrorCode.UNAUTHORIZED,
        'Refresh token has already been used or revoked. All active sessions have been invalidated for security.'
      );
    }
    throw new AuthError(ErrorCode.UNAUTHORIZED, 'Refresh session not found.');
  }

  // Check expiration
  if (session.expiresAt.getTime() <= Date.now()) {
    throw new AuthError(ErrorCode.UNAUTHORIZED, 'Refresh token has expired. Please log in again.');
  }

  // Verify User existence and active status
  const user = await User.findById(session.userId);
  if (!user || !user.isActive) {
    throw new AuthError(ErrorCode.UNAUTHORIZED, 'User account is inactive or not found.');
  }

  // ROTATION: Generate new refresh token & access token
  const { token: newRefreshToken, expiresAt: newExpiresAt } = generateRefreshToken(user._id.toString());
  const newTokenHash = hashToken(newRefreshToken);

  // Link old session to rotated replacement
  await RefreshSession.updateOne(
    { _id: session._id },
    { $set: { replacedByTokenHash: newTokenHash } }
  );

  // Create new session
  await RefreshSession.create({
    userId: user._id,
    tokenHash: newTokenHash,
    expiresAt: newExpiresAt,
    revokedAt: null,
    replacedByTokenHash: null,
    lastUsedAt: new Date(),
  });

  const accessToken = generateAccessToken(user);

  return {
    accessToken,
    newRefreshToken,
    newExpiresAt,
    user,
  };
}

/**
 * Revokes a refresh token session on logout.
 */
export async function revokeRefreshSession(rawToken: string): Promise<void> {
  if (!rawToken || typeof rawToken !== 'string' || !rawToken.trim()) {
    return;
  }

  const tokenHash = hashToken(rawToken);
  await RefreshSession.updateOne(
    { tokenHash, revokedAt: null },
    { $set: { revokedAt: new Date() } }
  );
}
