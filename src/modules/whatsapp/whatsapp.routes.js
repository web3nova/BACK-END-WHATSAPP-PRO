import { Router } from 'express';

// ============================================================
// WhatsApp Webhook — Owner: Dev 4
// 👉 START HERE. This stub is already mounted in src/routes/index.js.
// Build the matching *.controller.js + *.service.js in this folder,
// then declare routes below.
// Pattern + conventions: docs/architecture.md  (worked example: src/modules/knowledge)
// ============================================================
const router = Router();

import * as controller from './whatsapp.controller.js';
import { verifySignature } from './whatsapp.middleware.js';

/**
 * @openapi
 * /webhook:
 *   get:
 *     summary: Verify WhatsApp Webhook
 *     tags: [WhatsApp]
 *     parameters:
 *       - in: query
 *         name: hub.mode
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: hub.verify_token
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: hub.challenge
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Webhook verified
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 */
router.get('/', controller.verifyWebhook);

/**
 * @openapi
 * /webhook:
 *   post:
 *     summary: Receive WhatsApp Messages
 *     tags: [WhatsApp]
 *     responses:
 *       200:
 *         description: Message received
 */
router.post('/', verifySignature, controller.receiveWebhook);

export default router;
