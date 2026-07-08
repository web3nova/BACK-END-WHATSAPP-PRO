// src/modules/auth/auth.routes.js
import { Router } from 'express';
import {
  registerHandler,
  loginHandler,
  verifyOtpHandler,
  resendOtpHandler,
  refreshHandler,
  logoutHandler,
  forgotPasswordHandler,
  resetPasswordHandler,
} from './auth.controller.js';
import { validate } from '../../middleware/validate.middleware.js';
import { ipRateLimiter } from '../../middleware/rateLimiter.middleware.js';
import {
  registerSchema,
  loginSchema,
  verifyOtpSchema,
  resendOtpSchema,
  refreshSchema,
  logoutSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from './auth.validation.js';

const router = Router();

/**
 * @openapi
 * /auth/register:
 *   post:
 *     summary: Register a new tenant + first user
 *     description: Creates a tenant and owner account. Returns access + refresh tokens immediately.
 *     tags: [Auth]
 *     security: []
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
 *     responses:
 *       201:
 *         description: Registration successful — tokens issued
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     accessToken: { type: string }
 *                     refreshToken: { type: string }
 *                     user:
 *                       type: object
 *                       properties:
 *                         id: { type: string }
 *                         email: { type: string }
 *                         name: { type: string }
 *                         tenantId: { type: string }
 *       400:
 *         description: Email already in use or invalid payload
 */
router.post('/register', validate(registerSchema, 'body'), registerHandler);

/**
 * @openapi
 * /auth/login:
 *   post:
 *     summary: Login with email + password — returns tokens
 *     tags: [Auth]
 *     security: []
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
 *     responses:
 *       200:
 *         description: Login successful — tokens issued
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     accessToken: { type: string }
 *                     refreshToken: { type: string }
 *                     user:
 *                       type: object
 *                       properties:
 *                         id: { type: string }
 *                         email: { type: string }
 *                         name: { type: string }
 *                         tenantId: { type: string }
 *       401:
 *         description: Invalid credentials or banned account
 */
const loginLimiter = ipRateLimiter({ windowMs: 15 * 60_000, max: 10, message: 'Too many login attempts — wait 15 minutes and try again.' });
const otpLimiter = ipRateLimiter({ windowMs: 15 * 60_000, max: 5, message: 'Too many OTP requests — wait 15 minutes.' });

router.post('/login', loginLimiter, validate(loginSchema, 'body'), loginHandler);
router.post('/verify-otp', loginLimiter, validate(verifyOtpSchema, 'body'), verifyOtpHandler);
router.post('/resend-otp', otpLimiter, validate(resendOtpSchema, 'body'), resendOtpHandler);

/**
 * @openapi
 * /auth/refresh:
 *   post:
 *     summary: Exchange a refresh token for a new access token
 *     description: Issues a new access token. Returns 401 if the session has been inactive for more than 10 minutes — the user must re-authenticate via /auth/login.
 *     tags: [Auth]
 *     security: []
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
 *                 example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *     responses:
 *       200:
 *         description: New access token issued
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     accessToken: { type: string }
 *       401:
 *         description: Invalid/expired refresh token or session expired due to inactivity
 */
router.post('/refresh', validate(refreshSchema, 'body'), refreshHandler);

/**
 * @openapi
 * /auth/logout:
 *   post:
 *     summary: Logout — invalidates the refresh token
 *     tags: [Auth]
 *     security: []
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
 *                 example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *     responses:
 *       200:
 *         description: Logged out successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message: { type: string, example: "Logged out successfully" }
 */
router.post('/logout', validate(logoutSchema, 'body'), logoutHandler);

/**
 * @openapi
 * /auth/forgot-password:
 *   post:
 *     summary: Request a password reset email
 *     tags: [Auth]
 *     security: []
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
 *     responses:
 *       200:
 *         description: Reset email dispatched (response is identical whether the email exists or not)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message: { type: string, example: "If that email exists, a reset link has been sent" }
 */
const forgotLimiter = ipRateLimiter({ windowMs: 15 * 60_000, max: 5, message: 'Too many password reset requests — wait 15 minutes.' });
router.post('/forgot-password', forgotLimiter, validate(forgotPasswordSchema, 'body'), forgotPasswordHandler);

/**
 * @openapi
 * /auth/reset-password:
 *   post:
 *     summary: Reset password using a token from email
 *     tags: [Auth]
 *     security: []
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
 *                 example: newpassword123
 *     responses:
 *       200:
 *         description: Password reset successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message: { type: string }
 *       400:
 *         description: Invalid, expired, or already-used reset token
 */
router.post('/reset-password', validate(resetPasswordSchema, 'body'), resetPasswordHandler);

export default router;
