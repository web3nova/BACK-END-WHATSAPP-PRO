import { Router } from 'express';
import { getStatus } from './onboarding.controller.js';

const router = Router();

/**
 * @openapi
 * /onboarding/status:
 *   get:
 *     summary: Get onboarding completion status for the current tenant
 *     description: Returns which onboarding steps are complete and the next pending step.
 *     tags: [Onboarding]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Onboarding status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     steps:
 *                       type: object
 *                       properties:
 *                         account:      { type: boolean }
 *                         business:     { type: boolean }
 *                         whatsapp:     { type: boolean }
 *                         subscription: { type: boolean }
 *                     nextStep:
 *                       type: string
 *                       nullable: true
 *                       example: business
 *                     completed:
 *                       type: boolean
 *                     subscription:
 *                       type: object
 *                       nullable: true
 */
router.get('/status', getStatus);

export default router;
