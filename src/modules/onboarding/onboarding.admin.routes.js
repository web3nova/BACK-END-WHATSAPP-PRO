import { Router } from 'express';
import { getStepDataAdmin, getProgressAdmin } from './onboarding.controller.js';
import { requirePermission } from '../../middleware/rbac.middleware.js';

// Mount this router at something like: app.use('/admin/tenants', onboardingAdminRoutes)
// so the final paths are:
//   GET /admin/tenants/:tenantId/onboarding/steps/:step
//   GET /admin/tenants/:tenantId/onboarding/progress
const router = Router({ mergeParams: true });

/**
 * @openapi
 * /admin/tenants/{tenantId}/onboarding/steps/{step}:
 *   get:
 *     summary: (Admin) View a specific tenant's saved data for one onboarding step
 *     description: >
 *       Same data shape as GET /onboarding/steps/{step}, but for any tenant,
 *       identified explicitly by tenantId. Requires the 'onboarding:view'
 *       permission (super admins bypass this automatically).
 *     tags: [Onboarding Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tenantId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: step
 *         required: true
 *         schema:
 *           type: string
 *           enum: [business, whatsapp, subscription]
 *     responses:
 *       200:
 *         description: Saved step data for the given tenant
 *       400:
 *         description: Unknown step or missing tenantId
 *       403:
 *         description: Caller lacks the 'onboarding:view' permission
 */
router.get('/:tenantId/onboarding/steps/:step', requirePermission('onboarding:view'), getStepDataAdmin);

/**
 * @openapi
 * /admin/tenants/{tenantId}/onboarding/progress:
 *   get:
 *     summary: (Admin) Full onboarding picture for any tenant
 *     description: >
 *       Same shape as GET /onboarding/progress, but for any tenant, identified
 *       explicitly by tenantId. Requires the 'onboarding:view' permission
 *       (super admins bypass this automatically).
 *     tags: [Onboarding Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tenantId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Full onboarding progress for the given tenant
 *       403:
 *         description: Caller lacks the 'onboarding:view' permission
 */
router.get('/:tenantId/onboarding/progress', requirePermission('onboarding:view'), getProgressAdmin);

export default router;