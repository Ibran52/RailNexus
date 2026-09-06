/**
 * authRoutes.ts — RailNexus Backend
 * Routes for registration, login, refresh token rotation, profile lookup,
 * profile update, password change, and logout.
 */

import { Router } from 'express';
import {
  changePassword,
  getMe,
  login,
  loginController,
  logout,
  refresh,
  register,
  registerController,
  updateProfile,
} from '../controllers/authController';
import { authenticate } from '../middleware/auth';
import { authLimiter } from '../middleware/rateLimiter';

const router = Router();

router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);
router.post('/controller/register', authLimiter, registerController);
router.post('/controller/login', authLimiter, loginController);
router.post('/refresh', authLimiter, refresh);
router.get('/me', authenticate, getMe);
router.patch('/me', authenticate, updateProfile);
router.patch('/password', authenticate, changePassword);
router.post('/logout', logout);

export default router;
