import { Router } from 'express';
import * as controller from './customer-auth.controller.js';
import { customerAuthMiddleware } from '../../middleware/customer-auth.middleware.js';

const router = Router();

router.post('/signup', controller.signup);
router.post('/login', controller.login);
router.post('/google', controller.googleLogin);
router.post('/passkey/register/start', customerAuthMiddleware, controller.passkeyRegisterStart);
router.post('/passkey/register/complete', customerAuthMiddleware, controller.passkeyRegisterComplete);
router.post('/passkey/login/start', controller.passkeyLoginStart);
router.post('/passkey/login/complete', controller.passkeyLoginComplete);
router.get('/me', customerAuthMiddleware, controller.getProfile);

export default router;
