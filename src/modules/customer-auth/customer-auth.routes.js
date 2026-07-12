import { Router } from 'express';
import * as controller from './customer-auth.controller.js';
import { customerAuthMiddleware } from '../../middleware/customer-auth.middleware.js';

const router = Router();

router.post('/signup', controller.signup);
router.post('/login', controller.login);
router.get('/me', customerAuthMiddleware, controller.getProfile);

export default router;
