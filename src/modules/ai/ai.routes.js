import { Router } from 'express';
import * as aiController from './ai.controller.js';

const router = Router();

/**
 * @openapi
 * /ai/chat:
 *   post:
 *     tags: [AI]
 *     summary: Send a customer message through the AI agent (tool-calling loop)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [conversationId, message]
 *             properties:
 *               conversationId: { type: string }
 *               customerId: { type: string }
 *               message: { type: string }
 *     responses:
 *       200: { description: AI reply }
 */
router.post('/chat', aiController.chat);

/**
 * @openapi
 * /ai/memory/{conversationId}:
 *   delete:
 *     tags: [AI]
 *     summary: Clear the short-term memory for a conversation
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Memory cleared }
 */
router.delete('/memory/:conversationId', aiController.resetMemory);

export default router;
