// src/modules/auth/auth.routes.js
import { Router } from 'express';
import {
  registerHandler,
  loginHandler,
  verifyOtpHandler,
  refreshHandler,
  forgotPasswordHandler,
  resetPasswordHandler,
} from './auth.controller.js';
import { validate } from '../../middleware/validate.middleware.js';
import {
  registerSchema,
  loginSchema,
  verifyOtpSchema,
  refreshSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from './auth.validation.js';

const router = Router();

/**
 * @openapi
 * /auth/register:
 *   post:
 *     summary: Register a new tenant + first user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, tenantName]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: test@example.com
 *               password:
 *                 type: string
 *                 minLength: 8
 *                 example: password123
 *               name:
 *                 type: string
 *                 example: Test User
 *               tenantName:
 *                 type: string
 *                 example: Acme Corp
 */
router.post('/register', validate(registerSchema, 'body'), registerHandler);

/**
 * @openapi
 * /auth/login:
 *   post:
 *     summary: Login with email + password — sends OTP to email
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: test@example.com
 *               password:
 *                 type: string
 *                 example: password123
 */
router.post('/login', validate(loginSchema, 'body'), loginHandler);

/**
 * @openapi
 * /auth/verify-otp:
 *   post:
 *     summary: Verify OTP after login — returns access + refresh tokens
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, otp]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: test@example.com
 *               otp:
 *                 type: string
 *                 example: "123456"
 */
router.post('/verify-otp', validate(verifyOtpSchema, 'body'), verifyOtpHandler);

/**
 * @openapi
 * /auth/refresh:
 *   post:
 *     summary: Exchange a refresh token for a new access token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken:
 *                 type: string
 */
router.post('/refresh', validate(refreshSchema, 'body'), refreshHandler);

/**
 * @openapi
 * /auth/forgot-password:
 *   post:
 *     summary: Request a password reset email
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 */
router.post('/forgot-password', validate(forgotPasswordSchema, 'body'), forgotPasswordHandler);

/**
 * @openapi
 * /auth/reset-password:
 *   post:
 *     summary: Reset password using a token from email
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, password]
 *             properties:
 *               token:
 *                 type: string
 *               password:
 *                 type: string
 *                 minLength: 8
 */
router.post('/reset-password', validate(resetPasswordSchema, 'body'), resetPasswordHandler);

export default router;