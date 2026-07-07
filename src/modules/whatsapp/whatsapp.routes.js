import { Router } from 'express';
import * as controller from './whatsapp.controller.js';
import { verifySignature } from './whatsapp.middleware.js';

// ── Public: Meta webhook (no JWT — verified by signature) ──────────────
const router = Router();

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

// ── Protected: WhatsApp business setup (JWT + tenant required) ──────────
export const setupRouter = Router();

/**
 * @openapi
 * /whatsapp/connect:
 *   post:
 *     summary: Connect WhatsApp via Meta Embedded Signup
 *     tags: [WhatsApp]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code, wabaId, phoneNumberId]
 *             properties:
 *               code:
 *                 type: string
 *                 description: OAuth code from Meta Embedded Signup popup
 *               redirectUri:
 *                 type: string
 *               wabaId:
 *                 type: string
 *                 description: WhatsApp Business Account ID from Meta
 *               phoneNumberId:
 *                 type: string
 *                 description: Phone Number ID from Meta
 *     responses:
 *       200:
 *         description: WhatsApp account connected
 */
setupRouter.get('/account', controller.getAccount);
setupRouter.post('/connect', controller.connect);

export default router;
