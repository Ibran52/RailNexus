/**
 * brainRoutes.ts — RailNexus Backend
 * Routes for Brain health checks and dataset status proxies.
 */

import { Router } from 'express';
import {
  getBrainDataStatus,
  getBrainHealth,
  getBrainSections,
  getBrainStations,
} from '../controllers/brainController';
import { authenticate } from '../middleware/auth';

const router = Router();

// Health, stations and sections catalog endpoints
router.get('/health', getBrainHealth);
router.get('/stations', getBrainStations);
router.get('/sections', getBrainSections);
router.get('/data-status', authenticate, getBrainDataStatus);

export default router;

