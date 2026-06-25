import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { tenantMiddleware } from '../../middleware/tenant.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import * as controller from './billing.controller.js';
import {
  createSubscriptionSchema,
  updateSubscriptionSchema,
} from './billing.validation.js';

const router = Router();

router.use(authMiddleware, tenantMiddleware);

/**
 * @openapi
 * /billing/subscription:
 *   get:
 *     summary: Get current tenant subscription
 *     tags: [Billing]
 */
router.get('/subscription', controller.getSubscription);

/**
 * @openapi
 * /billing/subscription:
 *   post:
 *     summary: Create a subscription for the tenant
 *     tags: [Billing]
 */
router.post('/subscription', validate(createSubscriptionSchema), controller.createSubscription);

/**
 * @openapi
 * /billing/subscription:
 *   patch:
 *     summary: Update the tenant subscription plan or status
 *     tags: [Billing]
 */
router.patch('/subscription', validate(updateSubscriptionSchema), controller.updateSubscription);

/**
 * @openapi
 * /billing/subscription/cancel:
 *   patch:
 *     summary: Cancel the tenant subscription
 *     tags: [Billing]
 */
router.patch('/subscription/cancel', controller.cancelSubscription);

/**
 * @openapi
 * /billing/limits:
 *   get:
 *     summary: Get current plan limits for the tenant
 *     tags: [Billing]
 */
router.get('/limits', controller.getLimits);

export default router;