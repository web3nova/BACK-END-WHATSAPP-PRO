import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { requireSuperAdmin } from '../../middleware/superadmin.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import * as controller from './admin.controller.js';
import { z } from 'zod';

const router = Router();

// All superadmin routes require auth + isSuperAdmin
router.use(authMiddleware, requireSuperAdmin);

/**
 * @openapi
 * /admin/stats:
 *   get:
 *     summary: Platform-wide stats
 *     tags: [SuperAdmin]
 */
router.get('/stats', controller.stats);

/**
 * @openapi
 * /admin/tenants/{id}/suspend:
 *   patch:
 *     summary: Suspend a tenant
 *     tags: [SuperAdmin]
 */
router.patch('/tenants/:id/suspend', controller.suspend);

/**
 * @openapi
 * /admin/tenants/{id}/activate:
 *   patch:
 *     summary: Activate a suspended tenant
 *     tags: [SuperAdmin]
 */
router.patch('/tenants/:id/activate', controller.activate);

/**
 * @openapi
 * /admin/tenants/{id}/plan:
 *   patch:
 *     summary: Manually set a tenant subscription plan
 *     tags: [SuperAdmin]
 */
router.patch(
  '/tenants/:id/plan',
  validate(
    z.object({
      params: z.object({ id: z.string().uuid() }),
      body: z.object({
        plan:     z.string().optional(),
        status:   z.string().optional(),
        renewsAt: z.coerce.date().optional(),
      }),
    })
  ),
  controller.setPlan
);

/**
 * @openapi
 * /admin/admins:
 *   get:
 *     summary: List all super admins
 *     tags: [SuperAdmin]
 */
router.get('/admins', controller.listAdmins);

/**
 * @openapi
 * /admin/admins:
 *   post:
 *     summary: Create a new super admin
 *     tags: [SuperAdmin]
 */
router.post(
  '/admins',
  validate(
    z.object({
      body: z.object({
        email:    z.string().email(),
        password: z.string().min(8),
        name:     z.string().optional(),
      }),
    })
  ),
  controller.createAdmin
);

/**
 * @openapi
 * /admin/admins/{id}:
 *   delete:
 *     summary: Delete a super admin (cannot delete yourself)
 *     tags: [SuperAdmin]
 */
router.delete(
  '/admins/:id',
  validate(z.object({ params: z.object({ id: z.string().uuid() }) })),
  controller.deleteAdmin
);

export default router;