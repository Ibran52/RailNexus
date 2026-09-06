/**
 * roles.ts — RailNexus Backend
 * Role-Based Access Control (RBAC) middleware.
 */

import { Request, Response, NextFunction } from 'express';
import { ErrorCode, Role } from '../config/constants';

export function authorizeRoles(...allowedRoles: (Role | string)[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: {
          code: ErrorCode.UNAUTHORIZED,
          message: 'Authentication required before accessing this resource.',
        },
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: {
          code: ErrorCode.FORBIDDEN,
          message: `Access denied. Role '${req.user.role}' is not authorized to perform this action.`,
        },
      });
      return;
    }

    next();
  };
}
