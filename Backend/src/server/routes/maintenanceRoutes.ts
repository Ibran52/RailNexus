/**
 * maintenanceRoutes.ts — RailNexus Backend
 * Routes for maintenance department request submission and status viewing.
 */

import { Router } from 'express';
import {
  createRequest,
  getAnalysis,
  getRequest,
  getRequests,
  streamEvents,
} from '../controllers/maintenanceController';
import { authenticate } from '../middleware/auth';
import { authorizeRoles } from '../middleware/roles';
import { checkIdempotency } from '../middleware/idempotency';
import { validateCreateRequest } from '../middleware/validation';
import { Role } from '../config/constants';

const router = Router();

// Require authentication for all maintenance routes
router.use(authenticate);

// Restrict maintenance routes to maintenance roles (and admin)
router.use(
  authorizeRoles(
    Role.MAINTENANCE_ENGINEERING,
    Role.MAINTENANCE_SNT,
    Role.MAINTENANCE_OHE,
    Role.ADMIN
  )
);

router.post(['/', '/requests'], checkIdempotency, validateCreateRequest, createRequest);
router.get(['/', '/requests'], getRequests);
router.get('/events', streamEvents);
router.get(['/:requestId', '/requests/:requestId'], getRequest);
router.get(['/:requestId/analysis', '/requests/:requestId/analysis'], getAnalysis);

export default router;

