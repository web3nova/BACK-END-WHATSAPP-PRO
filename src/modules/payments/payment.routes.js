import { Router } from 'express';
import * as controller from './payment.controller.js';
import validate from '../../middleware/validate.middleware.js';
import { initializePaymentSchema, paymentIdParamSchema } from './payment.validation.js';

const router = Router();

/**
 * @openapi
 * /payments/initialize:
 *   post:
 *     summary: Initialize a payment for an order
 *     tags: [Payments]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [orderId, email]
 *             properties:
 *               orderId:
 *                 type: string
 *                 format: uuid
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Customer email for the payment gateway
 *               provider:
 *                 type: string
 *                 description: Payment provider to use (defaults to tenant config). e.g. paystack
 *     responses:
 *       200:
 *         description: Payment initialized — returns gateway authorization URL
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     authorizationUrl: { type: string }
 *                     reference: { type: string }
 *       400:
 *         description: Validation error or unsupported provider
 *       404:
 *         description: Order not found
 */
router.post('/initialize', validate(initializePaymentSchema), controller.initialize);

/**
 * @openapi
 * /payments/webhook/{provider}:
 *   post:
 *     summary: Receive a payment webhook from a gateway
 *     tags: [Payments]
 *     security: []
 *     parameters:
 *       - in: path
 *         name: provider
 *         required: false
 *         schema:
 *           type: string
 *         description: Payment provider name (e.g. paystack). Falls back to tenant default.
 *     requestBody:
 *       description: Webhook payload from the payment provider
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Webhook received and processed
 *       400:
 *         description: Invalid signature or unknown event
 */
router.post('/webhook/:provider?', controller.webhook);

/**
 * @openapi
 * /payments/{id}:
 *   get:
 *     summary: Get a payment record by ID
 *     tags: [Payments]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Payment details
 *       404:
 *         description: Payment not found
 */
router.get('/:id', validate(paymentIdParamSchema, 'params'), controller.getOne);

export default router;
