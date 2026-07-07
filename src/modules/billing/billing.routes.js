// src/modules/billing/billing.routes.js
import { Router } from 'express';
import { requireSuperAdmin } from '../../middleware/superadmin.middleware.js';
import { validate }          from '../../middleware/validate.middleware.js';
import * as controller       from './billing.controller.js';
import { initPaymentSchema, upsertPlanSchema } from './billing.validation.js';

// authMiddleware + tenantMiddleware already applied globally in routes/index.js
const router = Router();

/**
 * @openapi
 * /billing/subscription:
 *   get:
 *     summary: Get the current tenant's subscription status
 *     tags: [Billing]
 *     responses:
 *       200:
 *         description: Subscription object (null if none exists)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   nullable: true
 *                   properties:
 *                     status: { type: string, enum: [TRIAL, ACTIVE, EXPIRED, CANCELLED] }
 *                     plan: { type: string, nullable: true }
 *                     trialEndsAt: { type: string, format: date-time, nullable: true }
 *                     currentPeriodEnd: { type: string, format: date-time, nullable: true }
 *                     isActive: { type: boolean }
 */
router.get('/subscription', controller.getSubscription);
router.post('/trial', controller.activateTrial);

/**
 * @openapi
 * /billing/initialize:
 *   post:
 *     summary: Initialize a Monnify checkout for a subscription plan
 *     tags: [Billing]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [planId]
 *             properties:
 *               planId:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       200: { description: Checkout URL and reference }
 *       400: { description: Invalid plan or Monnify error }
 */
router.post('/initialize', validate(initPaymentSchema, 'body'), controller.initializePayment);

/**
 * @openapi
 * /billing/plans/upsert:
 *   post:
 *     summary: Super admin — create or update a billing plan
 *     tags: [Billing]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, label, priceMinor, intervalDays]
 *             properties:
 *               name:
 *                 type: string
 *                 description: Unique machine-readable key (e.g. "monthly")
 *                 example: monthly
 *               label:
 *                 type: string
 *                 description: Human-readable display name
 *                 example: Monthly Plan
 *               priceMinor:
 *                 type: integer
 *                 description: Price in kobo (NGN minor units)
 *                 example: 500000
 *               currency:
 *                 type: string
 *                 default: NGN
 *                 example: NGN
 *               intervalDays:
 *                 type: integer
 *                 description: Billing cycle in days (30 = monthly, 365 = yearly)
 *                 example: 30
 *               isActive:
 *                 type: boolean
 *                 default: true
 *     responses:
 *       201: { description: Plan created or updated }
 *       400: { description: Validation error }
 *       403: { description: Super admin only }
 */
router.post('/plans/upsert', requireSuperAdmin, validate(upsertPlanSchema, 'body'), controller.upsertPlan);

export default router;