/**
 * controllerRoutes.ts — RailNexus Backend
 * Routes for controller review, approval, modification, rejection, what-if, and SSE updates.
 */

import { Router } from 'express';
import {
  approve,
  getAllRequests,
  getHistory,
  getRequestAnalysis,
  getRequestDetails,
  modify,
  reject,
  streamEvents,
  whatIf,
} from '../controllers/controllerController';
import { authenticate } from '../middleware/auth';
import { authorizeRoles } from '../middleware/roles';
import {
  validateDecisionReason,
  validateModifyRequest,
  validateWhatIfRequest,
} from '../middleware/validation';
import { Role } from '../config/constants';

const router = Router();

// All controller routes require authentication and CONTROLLER or ADMIN role
router.use(authenticate);
router.use(authorizeRoles(Role.CONTROLLER, Role.ADMIN));

router.get(['/', '/requests'], getAllRequests);
router.get('/history', getHistory);
router.get('/events', streamEvents);
router.get(['/requests/:requestId', '/:requestId'], getRequestDetails);
router.get(['/requests/:requestId/analysis', '/:requestId/analysis'], getRequestAnalysis);
router.post(['/requests/:requestId/approve', '/approve'], validateDecisionReason, approve);
router.post(['/requests/:requestId/modify', '/modify'], validateModifyRequest, modify);
router.post(['/requests/:requestId/reject', '/reject'], validateDecisionReason, reject);
router.post(['/what-if', '/whatif'], validateWhatIfRequest, whatIf);


export default router;
