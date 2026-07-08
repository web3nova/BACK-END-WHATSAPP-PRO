import { Router } from 'express';
import * as controller from './team.controller.js';

const router = Router();

// All routes here are protected — authMiddleware + tenantMiddleware applied globally
router.get('/members', controller.getMembers);
router.post('/invites', controller.invite);
router.delete('/invites/:inviteId', controller.cancel);
router.delete('/members/:userId', controller.remove);

export default router;
