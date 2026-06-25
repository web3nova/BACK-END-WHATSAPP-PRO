import { Router } from 'express';
import { sendNotification } from './notification.controller.js';

const router = Router();

/**
 * @openapi
 * /notifications/send:
 *   post:
 *     tags: [Notifications]
 *     summary: Send a notification via email, whatsapp or sms
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [channel, to, text]
 *             properties:
 *               channel: { type: string, enum: [email, whatsapp, sms] }
 *               to: { type: string }
 *               subject: { type: string }
 *               text: { type: string }
 *               html: { type: string }
 *     responses:
 *       200: { description: Notification sent }
 */
router.post('/send', sendNotification);

export default router;
