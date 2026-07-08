import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import * as controller from './team.controller.js';

const router = Router();

// Public — accept invite (new user sets password)
router.post('/accept-invite', controller.accept);

// Protected — all team management routes
router.use(authMiddleware);

router.get('/members', controller.getMembers);
router.post('/invites', controller.invite);
router.delete('/invites/:inviteId', controller.cancel);
router.delete('/members/:userId', controller.remove);

export default router;
