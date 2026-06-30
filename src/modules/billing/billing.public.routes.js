import { Router } from 'express';
import * as controller from './billing.controller.js';

// Public billing routes — no JWT required.
// /billing/plans   : unauthenticated users can browse plans before signing up.
// /billing/webhook : Monnify calls this directly with its own signature verification.
const router = Router();

/**
 * @openapi
 * /billing/plans:
 *   get:
 *     summary: Get all active billing plans
 *     tags: [Billing]
 *     security: []
 *     responses:
 *       200: { description: List of active plans }
 */
router.get('/plans', controller.getPlans);

/**
 * @openapi
 * /billing/webhook:
 *   post:
 *     summary: Monnify payment webhook — signature verified internally
 *     tags: [Billing]
 *     security: []
 *     responses:
 *       200: { description: Webhook processed }
 *       400: { description: Invalid signature or unknown event }
 */
router.post('/webhook', controller.webhook);

export default router;
