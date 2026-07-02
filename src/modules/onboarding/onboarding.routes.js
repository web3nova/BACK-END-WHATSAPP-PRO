import { Router } from 'express';
import { getStatus, markStepComplete } from './onboarding.controller.js';
import { requirePermission } from '../../middleware/rbac.middleware.js';

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

/**
 * @openapi
 * /onboarding/steps/{step}/complete:
 *   post:
 *     summary: Manually mark an onboarding step complete (admin override)
 *     description: >
 *       Forces a specific onboarding step to a completed state for the current
 *       tenant, regardless of the underlying data (e.g. support waiving WhatsApp
 *       verification). Requires the 'onboarding:override' permission (super admins
 *       bypass this automatically). The 'account' step cannot be overridden since
 *       it is trivially always true.
 *     tags: [Onboarding]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: step
 *         required: true
 *         schema:
 *           type: string
 *           enum: [business, whatsapp, subscription]
 *         description: The onboarding step to mark complete
 *     responses:
 *       200:
 *         description: Updated onboarding status
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
 *                     completed:
 *                       type: boolean
 *                     subscription:
 *                       type: object
 *                       nullable: true
 *                     overriddenSteps:
 *                       type: array
 *                       items: { type: string }
 *       400:
 *         description: Invalid or non-overridable step
 *       403:
 *         description: Caller lacks the 'onboarding:override' permission
 */
router.post('/steps/:step/complete', requirePermission('onboarding:override'), markStepComplete);

export default router;