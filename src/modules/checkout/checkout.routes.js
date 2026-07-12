import { Router } from 'express';
import * as checkoutController from './checkout.controller.js';
import validate from '../../middleware/validate.middleware.js';
import { checkoutValidation, paymentValidation, completeOrderValidation } from './checkout.validation.js';
import { customerAuthMiddleware } from '../../middleware/customer-auth.middleware.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';

const router = Router();

/**
 * @openapi
 * /checkout:
 *   post:
 *     summary: Initialize checkout with delivery options and items
 *     tags: [Checkout]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [items]
 *             properties:
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [id, name, priceMinor, quantity]
 *                   properties:
 *                     id: { type: string }
 *                     name: { type: string }
 *                     priceMinor: { type: integer, minimum: 0 }
 *                     quantity: { type: integer, minimum: 1, maximum: 100 }
 *                     imageUrl: { type: string }
 *               deliveryMethod:
 *                 type: string
 *                 enum: [standard, express, same-day, international]
 *                 default: standard
 *               paymentMethod:
 *                 type: string
 *                 enum: [paystack, monnify, card, wallet]
 *                 default: paystack
 *     responses:
 *       201:
 *         description: Checkout initialized successfully with delivery options and payment methods
 *       400:
 *         description: Validation error or missing required fields
 *       401:
 *         description: Authentication required
 *        401:
 *         description: Delivery time requirements not met
 *       404:
 *         description: Business profile not found
 *       503:
 *         description: Payment provider not configured
 */
router.post('/',
  authMiddleware,
  validate(checkoutValidation),
  checkoutController.initializeCheckout
);

/**
 * @openapi
 * /checkout/payment:
 *   post:
 *     summary: Process payment for a checkout
 *     tags: [Checkout]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [orderId, paymentMethod]
 *             properties:
 *               orderId:
 *                 type: string
 *                 format: uuid
 *               paymentMethod:
 *                 type: string
 *                 enum: [paystack, monnify, card, wallet]
 *                 default: paystack
 *               amount:
 *                 type: integer
 *                 minimum: 1
 *               currency:
 *                 type: string
 *                 default: NGN
 *               paymentDetails:
 *                 type: object
 *                 properties:
 *                   cardNumber:
 *                     type: string
 *                   expiryMonth:
 *                     type: string
 *                   expiryYear:
 *                     type: string
 *                   cvv:
 *                     type: string
 *                   accountDetails:
 *                     type: object
 *                   redirectedUrl:
 *                     type: string
 *     responses:
 *       201:
 *         description: Payment processed successfully
 *       400:
 *         description: Validation error or payment declined
 *       401:
 *         description: Authentication required
 *       404:
 *         description: Order not found
 *       503:
 *         description: Payment gateway unavailable
 */
router.post('/payment',
  authMiddleware,
  validate(paymentValidation),
  checkoutController.processPayment
);

/**
 * @openapi
 * /checkout/complete:
 *   post:
 *     summary: Mark order as completed after successful payment
 *     tags: [Checkout]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [paymentReference, paymentProvider]
 *             properties:
 *               paymentReference:
 *                 type: string
 *               paymentProvider:
 *                 type: string
 *                 enum: [paystack, monnify, card, wallet]
 *               deliveryStatus:
 *                 type: string
 *                 enum: [pending, shipped, delivered, cancelled]
 *     responses:
 *       200:
 *         description: Order completed successfully
 *       400:
 *         description: Validation error or payment not found
 *       401:
 *         description: Authentication required
 */
router.post('/complete',
  authMiddleware,
  validate(completeOrderValidation),
  checkoutController.completeOrder
);

/**
 * @openapi
 * /checkout/customer/checkouts:
 *   get:
 *     summary: Get customer's active checkouts
 *     tags: [Checkout]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Customer checkouts retrieved successfully
 *       401:
 *         description: Authentication required
 */
router.get('/customer/checkouts',
  authMiddleware,
  checkoutController.getCustomerCheckouts
);

/**
 * @openapi
 * /checkout/customer/orders:
 *   get:
 *     summary: Get customer's order history
 *     tags: [Checkout]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Customer orders retrieved successfully
 *       401:
 *         description: Authentication required
 */
router.get('/customer/orders',
  authMiddleware,
  checkoutController.getCustomerOrders
);

/**
 * @openapi
 * /checkout/business/{businessId}:
 *   get:
 *     summary: Get checkout configuration for a business
 *     tags: [Checkout, Business]
 *     parameters:
 *       - in: path
 *         name: businessId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Checkout configuration retrieved successfully
 *       404:
 *         description: Business not found
 */
router.get('/business/:businessId',
  authMiddleware,
  checkoutController.getBusinessCheckoutConfig
);

/**
 * @openapi
 * /checkout/test-payment:
 *   post:
 *     summary: Test payment endpoint for development and testing
 *     tags: [Checkout, Testing]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [amount, currency]
 *             properties:
 *               amount:
 *                 type: integer
 *                 minimum: 100
 *               currency:
 *                 type: string
 *                 default: NGN
 *               paymentMethod:
 *                 type: string
 *                 enum: [paystack, monnify]
 *                 default: paystack
 *     responses:
 *       200:
 *         description: Test payment successful
 *       400:
 *         description: Invalid payment data
 *       503:
 *         description: Payment provider unavailable
 */
router.post('/test-payment',
  checkoutController.testPayment
);

/**
 * Webhook endpoint for payment provider callbacks
 * @openapi
 * /checkout/webhook/paystack:
 *   post:
 *     summary: Paystack payment webhook
 *     tags: [Webhook, Payment]
 *     security: []
 *     description: Webhook endpoint for processing Paystack payment callbacks
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               event:
 *                 type: string
 *               data:
 *                 type: object
 *     responses:
 *       200:
 *         description: Webhook processed successfully
 *       400:
 *         description: Invalid webhook payload
 */
router.post('/webhook/paystack', checkoutController.paystackWebhook);

/**
 * Meta endpoint for checkout supported payment providers
 * @openapi
 * /checkout/providers:
 *   get:
 *     summary: Get supported payment providers
 *     tags: [Checkout]
 *     security: []
 *     responses:
 *       200:
 *         description: Supported payment providers retrieved successfully
 */
router.get('/providers', checkoutController.getPaymentProviders);

export default router;
