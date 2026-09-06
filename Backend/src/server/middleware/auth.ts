/**
 * auth.ts — RailNexus Backend
 * JWT Authentication middleware.
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { ErrorCode, Role, Department } from '../config/constants';
import { AuthTokenPayload } from '../types';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: Role;
  department: Department;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      error: {
        code: ErrorCode.UNAUTHORIZED,
        message: 'Authentication token is missing or malformed.',
      },
    });
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as AuthTokenPayload;
    req.user = {
      id: decoded.sub,
      email: decoded.email,
      role: decoded.role,
      department: decoded.department,
    };
    next();
  } catch (err: any) {
    res.status(401).json({
      success: false,
      error: {
        code: ErrorCode.UNAUTHORIZED,
        message: 'Authentication token is invalid or expired.',
      },
    });
  }
}
