// src/modules/auth/auth.routes.js
import { Router } from 'express';
import { registerHandler, loginHandler, refreshHandler } from './auth.controller.js';
import { validate } from '../../middleware/validate.middleware.js';
import { registerSchema, loginSchema, refreshSchema } from './auth.validation.js';

const router = Router();

/**
 * @openapi
 * /auth/register:
 *   post:
 *     summary: Register a new tenant + first user
 *     tags: [Auth]
 */
router.post('/register', validate(registerSchema), registerHandler);

/**
 * @openapi
 * /auth/login:
 *   post:
 *     summary: Login with email + password
 *     tags: [Auth]
 */
router.post('/login', validate(loginSchema), loginHandler);

/**
 * @openapi
 * /auth/refresh:
 *   post:
 *     summary: Exchange a refresh token for a new access token
 *     tags: [Auth]
 */
router.post('/refresh', validate(refreshSchema), refreshHandler);

export default router;