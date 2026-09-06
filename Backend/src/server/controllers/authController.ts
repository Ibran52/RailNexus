/**
 * authController.ts — RailNexus Backend
 * User registration, authentication, profile lookup, refresh token rotation, and logout.
 */

import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { User } from '../models/User';
import { Department, ErrorCode, Role } from '../config/constants';
import {
  AuthError,
  generateAccessToken,
  generateRefreshToken,
  createRefreshSession,
  rotateRefreshToken,
  revokeRefreshSession,
  getRefreshCookieOptions,
  getClearCookieOptions,
  REFRESH_COOKIE_NAME,
} from '../services/authService';

export async function register(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { name, email, password, role, department, departmentType } = req.body;

    const userDepartment = department;

    if (!name || !email || !password || !role || !userDepartment) {
      res.status(400).json({
        success: false,
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'All fields (name, email, password, role, department) are required.',
        },
      });
      return;
    }

    const WORKER_ALLOWED_ROLES = [
      Role.MAINTENANCE_ENGINEERING,
      Role.MAINTENANCE_SNT,
      Role.MAINTENANCE_OHE,
    ];

    if (!WORKER_ALLOWED_ROLES.includes(role)) {
      res.status(400).json({
        success: false,
        error: {
          code: ErrorCode.INVALID_ROLE,
          message: 'Worker registration only accepts maintenance roles. Use the Controller registration endpoint for controller accounts.',
        },
      });
      return;
    }

    const isKnownDept = Object.values(Department).includes(userDepartment as any);
    const isCustomDept = Boolean(
      (departmentType === 'OTHER' || departmentType === 'Other' || typeof userDepartment === 'string') &&
      String(userDepartment).trim().length > 0
    );

    if (!isKnownDept && !isCustomDept) {
      res.status(400).json({
        success: false,
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: `Invalid department. Allowed: ${Object.values(Department).join(', ')} or custom department name.`,
        },
      });
      return;
    }

    const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
    if (existingUser) {
      res.status(409).json({
        success: false,
        error: {
          code: ErrorCode.EMAIL_EXISTS,
          message: 'A user with this email address is already registered.',
        },
      });
      return;
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    let user: any;
    try {
      user = await User.create({
        name: name.trim(),
        email: email.toLowerCase().trim(),
        passwordHash,
        role,
        department: String(userDepartment).trim(),
        departmentType: departmentType || userDepartment,
        isActive: true,
      });
    } catch (createErr: any) {
      if (createErr.code === 11000) {
        res.status(409).json({
          success: false,
          error: {
            code: ErrorCode.EMAIL_EXISTS,
            message: 'A user with this email address is already registered.',
          },
        });
        return;
      }
      throw createErr;
    }

    const token = generateAccessToken(user);
    const { token: refreshToken, expiresAt } = generateRefreshToken(user._id.toString());
    await createRefreshSession(user._id.toString(), refreshToken, expiresAt);

    res.cookie(REFRESH_COOKIE_NAME, refreshToken, getRefreshCookieOptions(expiresAt));

    res.status(201).json({
      success: true,
      message: 'User registered successfully.',
      data: {
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          department: user.department,
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

export function validateControllerId(id: string): { valid: boolean; message?: string } {
  if (!id || typeof id !== 'string') {
    return { valid: false, message: 'Controller ID is required.' };
  }
  if (id.includes(' ')) {
    return { valid: false, message: 'Controller ID must not contain spaces.' };
  }
  if (id.length !== 6) {
    return { valid: false, message: 'Controller ID must be exactly 6 characters.' };
  }
  if (!/[A-Z]/.test(id)) {
    return { valid: false, message: 'Controller ID must contain at least 1 uppercase letter.' };
  }
  if (!/[a-z]/.test(id)) {
    return { valid: false, message: 'Controller ID must contain at least 1 lowercase letter.' };
  }
  if (!/[^A-Za-z0-9]/.test(id)) {
    return { valid: false, message: 'Controller ID must contain at least 1 special character.' };
  }
  return { valid: true };
}

export async function registerController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { name, email, controllerId, password, confirmPassword } = req.body;

    if (!name || !email || !controllerId || !password) {
      res.status(400).json({
        success: false,
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'All fields (name, email, controllerId, password) are required.',
        },
      });
      return;
    }

    if (confirmPassword && password !== confirmPassword) {
      res.status(400).json({
        success: false,
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Passwords do not match.',
        },
      });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({
        success: false,
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Password must be at least 8 characters in length.',
        },
      });
      return;
    }

    const ctrlIdValidation = validateControllerId(controllerId);
    if (!ctrlIdValidation.valid) {
      res.status(400).json({
        success: false,
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: ctrlIdValidation.message || 'Controller ID is invalid.',
        },
      });
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();
    const normalizedCtrlId = controllerId.trim();

    // Check duplicate email
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      res.status(409).json({
        success: false,
        error: {
          code: ErrorCode.EMAIL_EXISTS,
          message: 'A user with this email address is already registered.',
        },
      });
      return;
    }

    // Check duplicate controller ID
    const existingCtrl = await User.findOne({ controllerId: normalizedCtrlId });
    if (existingCtrl) {
      res.status(409).json({
        success: false,
        error: {
          code: ErrorCode.CONTROLLER_ID_EXISTS,
          message: 'Controller ID is already registered.',
        },
      });
      return;
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    let user: any;
    try {
      user = await User.create({
        name: name.trim(),
        email: normalizedEmail,
        passwordHash,
        role: Role.CONTROLLER,
        department: Department.CONTROLLER,
        departmentType: Department.CONTROLLER,
        controllerId: normalizedCtrlId,
        isActive: true,
      });
    } catch (createErr: any) {
      if (createErr.code === 11000) {
        const keyPattern = createErr.keyPattern || {};
        if (keyPattern.controllerId || (createErr.message && createErr.message.includes('controllerId'))) {
          res.status(409).json({
            success: false,
            error: {
              code: ErrorCode.CONTROLLER_ID_EXISTS,
              message: 'Controller ID is already registered.',
            },
          });
          return;
        }
        if (keyPattern.email || (createErr.message && createErr.message.includes('email'))) {
          res.status(409).json({
            success: false,
            error: {
              code: ErrorCode.EMAIL_EXISTS,
              message: 'A user with this email address is already registered.',
            },
          });
          return;
        }
      }
      throw createErr;
    }

    const token = generateAccessToken(user);
    const { token: refreshToken, expiresAt } = generateRefreshToken(user._id.toString());
    await createRefreshSession(user._id.toString(), refreshToken, expiresAt);

    res.cookie(REFRESH_COOKIE_NAME, refreshToken, getRefreshCookieOptions(expiresAt));

    res.status(201).json({
      success: true,
      message: 'Controller registered successfully.',
      data: {
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          department: user.department,
          controllerId: user.controllerId,
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function loginController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, controllerId, password } = req.body;

    if (!email || !controllerId || !password) {
      res.status(400).json({
        success: false,
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Official Email, Controller ID, and password are required.',
        },
      });
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();
    const normalizedCtrlId = controllerId.trim();

    const user = await User.findOne({ email: normalizedEmail }).select('+passwordHash');
    if (!user || !user.isActive) {
      res.status(401).json({
        success: false,
        error: {
          code: ErrorCode.UNAUTHORIZED,
          message: 'Invalid controller credentials.',
        },
      });
      return;
    }

    if (user.role !== Role.CONTROLLER) {
      res.status(401).json({
        success: false,
        error: {
          code: ErrorCode.UNAUTHORIZED,
          message: 'Invalid controller credentials.',
        },
      });
      return;
    }

    if (!user.controllerId || user.controllerId !== normalizedCtrlId) {
      res.status(401).json({
        success: false,
        error: {
          code: ErrorCode.UNAUTHORIZED,
          message: 'Invalid controller credentials.',
        },
      });
      return;
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      res.status(401).json({
        success: false,
        error: {
          code: ErrorCode.UNAUTHORIZED,
          message: 'Invalid controller credentials.',
        },
      });
      return;
    }

    const token = generateAccessToken(user);
    const { token: refreshToken, expiresAt } = generateRefreshToken(user._id.toString());
    await createRefreshSession(user._id.toString(), refreshToken, expiresAt);

    res.cookie(REFRESH_COOKIE_NAME, refreshToken, getRefreshCookieOptions(expiresAt));

    res.status(200).json({
      success: true,
      message: 'Controller login successful.',
      data: {
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          department: user.department,
          controllerId: user.controllerId,
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, password, controllerId } = req.body;

    if (controllerId) {
      return loginController(req, res, next);
    }

    if (!email || !password) {
      res.status(400).json({
        success: false,
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Email and password are required.',
        },
      });
      return;
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+passwordHash');
    if (!user || !user.isActive) {
      res.status(401).json({
        success: false,
        error: {
          code: ErrorCode.UNAUTHORIZED,
          message: 'Invalid email or password credentials.',
        },
      });
      return;
    }

    // If user has a registered controllerId, enforce loginController
    if (user.controllerId) {
      res.status(401).json({
        success: false,
        error: {
          code: ErrorCode.UNAUTHORIZED,
          message: 'Controller accounts must sign in using Controller Login with Controller ID.',
        },
      });
      return;
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      res.status(401).json({
        success: false,
        error: {
          code: ErrorCode.UNAUTHORIZED,
          message: 'Invalid email or password credentials.',
        },
      });
      return;
    }

    const token = generateAccessToken(user);
    const { token: refreshToken, expiresAt } = generateRefreshToken(user._id.toString());
    await createRefreshSession(user._id.toString(), refreshToken, expiresAt);

    res.cookie(REFRESH_COOKIE_NAME, refreshToken, getRefreshCookieOptions(expiresAt));

    res.status(200).json({
      success: true,
      message: 'Login successful.',
      data: {
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          department: user.department,
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rawToken = req.cookies?.[REFRESH_COOKIE_NAME] || req.body?.refreshToken;
    if (!rawToken) {
      res.status(401).json({
        success: false,
        error: {
          code: ErrorCode.UNAUTHORIZED,
          message: 'Refresh token is missing.',
        },
      });
      return;
    }

    const { accessToken, newRefreshToken, newExpiresAt, user } = await rotateRefreshToken(rawToken);

    res.cookie(REFRESH_COOKIE_NAME, newRefreshToken, getRefreshCookieOptions(newExpiresAt));

    res.status(200).json({
      success: true,
      message: 'Token refreshed successfully.',
      data: {
        token: accessToken,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          department: user.department,
          ...(user.controllerId ? { controllerId: user.controllerId } : {}),
        },
      },
    });
  } catch (err: any) {
    if (err instanceof AuthError) {
      res.clearCookie(REFRESH_COOKIE_NAME, getClearCookieOptions());
      res.status(err.statusCode).json({
        success: false,
        error: {
          code: err.code,
          message: err.message,
        },
      });
      return;
    }
    next(err);
  }
}

export async function getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await User.findById(req.user?.id);
    if (!user) {
      res.status(404).json({
        success: false,
        error: {
          code: ErrorCode.REQUEST_NOT_FOUND,
          message: 'User record not found.',
        },
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
        isActive: user.isActive,
        ...(user.controllerId ? { controllerId: user.controllerId } : {}),
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /auth/me — Update authenticated user's name and/or email.
 * Role, department, controllerId, and isActive are strictly immutable via this endpoint.
 */
export async function updateProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { name, email } = req.body;

    if (!name && !email) {
      res.status(400).json({
        success: false,
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'At least one field (name or email) must be provided.',
        },
      });
      return;
    }

    const user = await User.findById(req.user?.id);
    if (!user) {
      res.status(404).json({
        success: false,
        error: {
          code: ErrorCode.REQUEST_NOT_FOUND,
          message: 'User record not found.',
        },
      });
      return;
    }

    if (name !== undefined) {
      const trimmedName = String(name).trim();
      if (trimmedName.length < 2) {
        res.status(400).json({
          success: false,
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Name must be at least 2 characters.',
          },
        });
        return;
      }
      user.name = trimmedName;
    }

    if (email !== undefined) {
      const normalizedEmail = String(email).toLowerCase().trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        res.status(400).json({
          success: false,
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Invalid email address format.',
          },
        });
        return;
      }

      // Check uniqueness excluding the current user
      const conflict = await User.findOne({ email: normalizedEmail, _id: { $ne: user._id } });
      if (conflict) {
        res.status(409).json({
          success: false,
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'This email address is already used by another account.',
          },
        });
        return;
      }
      user.email = normalizedEmail;
    }

    await user.save();

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully.',
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
        isActive: user.isActive,
        ...(user.controllerId ? { controllerId: user.controllerId } : {}),
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /auth/password — Change authenticated user's password.
 * Requires currentPassword verification before accepting newPassword.
 */
export async function changePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!currentPassword || !newPassword) {
      res.status(400).json({
        success: false,
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'currentPassword and newPassword are required.',
        },
      });
      return;
    }

    if (newPassword.length < 8) {
      res.status(400).json({
        success: false,
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'New password must be at least 8 characters.',
        },
      });
      return;
    }

    if (confirmPassword !== undefined && newPassword !== confirmPassword) {
      res.status(400).json({
        success: false,
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'New password and confirmation do not match.',
        },
      });
      return;
    }

    const user = await User.findById(req.user?.id).select('+passwordHash');
    if (!user) {
      res.status(404).json({
        success: false,
        error: {
          code: ErrorCode.REQUEST_NOT_FOUND,
          message: 'User record not found.',
        },
      });
      return;
    }

    const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isMatch) {
      res.status(401).json({
        success: false,
        error: {
          code: ErrorCode.UNAUTHORIZED,
          message: 'Current password is incorrect.',
        },
      });
      return;
    }

    const salt = await bcrypt.genSalt(10);
    user.passwordHash = await bcrypt.hash(newPassword, salt);
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Password changed successfully.',
    });
  } catch (err) {
    next(err);
  }
}

export async function logout(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rawToken = req.cookies?.[REFRESH_COOKIE_NAME] || req.body?.refreshToken;
    if (rawToken) {
      await revokeRefreshSession(rawToken);
    }
    res.clearCookie(REFRESH_COOKIE_NAME, getClearCookieOptions());
    res.status(200).json({
      success: true,
      message: 'Logged out successfully.',
    });
  } catch (err) {
    next(err);
  }
}
