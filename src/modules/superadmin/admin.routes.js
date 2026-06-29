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
      plan:     z.string().optional(),
      status:   z.string().optional(),
      renewsAt: z.coerce.date().optional(),
    }),
    'body'
  ),
  controller.setPlan
);

/**
 * @openapi
 * /admin/tenants/{tenantId}/users:
 *   get:
 *     summary: List all users in a tenant
 *     tags: [SuperAdmin]
 */
router.get('/tenants/:tenantId/users', controller.listTenantUsers);

/**
 * @openapi
 * /admin/users/{userId}/ban:
 *   patch:
 *     summary: Ban a user
 *     tags: [SuperAdmin]
 */
router.patch('/users/:userId/ban', controller.banUser);

/**
 * @openapi
 * /admin/users/{userId}/unban:
 *   patch:
 *     summary: Unban a user
 *     tags: [SuperAdmin]
 */
router.patch('/users/:userId/unban', controller.unbanUser);

/**
 * @openapi
 * /admin/users/{userId}/role:
 *   patch:
 *     summary: Assign a role to a user
 *     tags: [SuperAdmin]
 */
router.patch(
  '/users/:userId/role',
  validate(
    z.object({ roleId: z.string().uuid() }),
    'body'
  ),
  controller.assignRole
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
      email:    z.string().email(),
      password: z.string().min(8),
      name:     z.string().optional(),
    }),
    'body'
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
  validate(z.object({ id: z.string().uuid() }), 'params'),
  controller.deleteAdmin
);

export default router;