/**
 * auditRoutes.ts — RailNexus Backend
 * Routes for querying immutable operational audit logs.
 */

import { Router } from 'express';
import { getAuditLogs } from '../controllers/auditController';
import { authenticate } from '../middleware/auth';
import { authorizeRoles } from '../middleware/roles';
import { Role } from '../config/constants';

const router = Router();

router.use(authenticate);
router.use(authorizeRoles(Role.CONTROLLER, Role.ADMIN));

router.get('/', getAuditLogs);

export default router;
