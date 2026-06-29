// src/modules/billing/billing.routes.js
import { Router } from 'express';
import { authMiddleware }    from '../../middleware/auth.middleware.js';
import { requireSuperAdmin } from '../../middleware/superadmin.middleware.js';
import { validate }          from '../../middleware/validate.middleware.js';
import * as controller       from './billing.controller.js';
import { initPaymentSchema, upsertPlanSchema } from './billing.validation.js';

const router = Router();

/**
 * @openapi
 * /billing/plans:
 *   get:
 *     summary: Get all active billing plans
 *     tags: [Billing]
 */
router.get('/plans', controller.getPlans);

/**
 * @openapi
 * /billing/initialize:
 *   post:
 *     summary: Initialize a Monnify checkout for a subscription plan
 *     tags: [Billing]
 *     security: [{ bearerAuth: [] }]
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
 */
router.post('/initialize', authMiddleware, validate(initPaymentSchema, 'body'), controller.initializePayment);

/**
 * @openapi
 * /billing/webhook:
 *   post:
 *     summary: Monnify webhook — payment confirmation
 *     tags: [Billing]
 */
router.post('/webhook', controller.webhook);

/**
 * @openapi
 * /billing/plans/upsert:
 *   post:
 *     summary: Admin — create or update a billing plan
 *     tags: [Billing]
 *     security: [{ bearerAuth: [] }]
 */
router.post(
  '/plans/upsert',
  authMiddleware,
  requireSuperAdmin,
  validate(upsertPlanSchema, 'body'),
  controller.upsertPlan
);

export default router;