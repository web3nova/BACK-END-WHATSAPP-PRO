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
 *     responses:
 *       200:
 *         description: Platform stats
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalTenants: { type: integer }
 *                     activeTenants: { type: integer }
 *                     suspendedTenants: { type: integer }
 *                     totalUsers: { type: integer }
 *                     totalOrders: { type: integer }
 *       403:
 *         description: Super admin only
 */
router.get('/stats', controller.stats);

/**
 * @openapi
 * /admin/tenants:
 *   get:
 *     summary: List all tenants (paginated, searchable)
 *     tags: [SuperAdmin]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 25 }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Paginated tenant list
 *       403:
 *         description: Super admin only
 */
router.get('/tenants', controller.listTenants);

/**
 * @openapi
 * /admin/tenants/{id}:
 *   get:
 *     summary: Get full detail for a single tenant (plan, counts)
 *     tags: [SuperAdmin]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Tenant detail }
 *       403: { description: Super admin only }
 *       404: { description: Tenant not found }
 */
router.get('/tenants/:id', controller.getTenant);

/**
 * @openapi
 * /admin/tenants/{tenantId}/roles:
 *   get:
 *     summary: List roles available to a tenant (tenant-specific + global defaults)
 *     tags: [SuperAdmin]
 *     parameters:
 *       - in: path
 *         name: tenantId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: List of roles }
 *       403: { description: Super admin only }
 *       404: { description: Tenant not found }
 */
router.get('/tenants/:tenantId/roles', controller.listTenantRoles);

/**
 * @openapi
 * /admin/tenants/{id}/suspend:
 *   patch:
 *     summary: Suspend a tenant
 *     tags: [SuperAdmin]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Tenant suspended
 *       400:
 *         description: Tenant is already suspended
 *       403:
 *         description: Super admin only
 *       404:
 *         description: Tenant not found
 */
router.patch('/tenants/:id/suspend', controller.suspend);

/**
 * @openapi
 * /admin/tenants/{id}/activate:
 *   patch:
 *     summary: Activate a suspended tenant
 *     tags: [SuperAdmin]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Tenant activated
 *       400:
 *         description: Tenant is already active
 *       403:
 *         description: Super admin only
 *       404:
 *         description: Tenant not found
 */
router.patch('/tenants/:id/activate', controller.activate);

/**
 * @openapi
 * /admin/tenants/{id}/plan:
 *   patch:
 *     summary: Manually override a tenant's subscription plan
 *     tags: [SuperAdmin]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               planId:
 *                 type: string
 *                 format: uuid
 *                 description: BillingPlan ID to assign
 *               status:
 *                 type: string
 *                 enum: [TRIAL, ACTIVE, EXPIRED, CANCELLED]
 *               renewsAt:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       200:
 *         description: Subscription updated
 *       400:
 *         description: Invalid plan ID or status
 *       403:
 *         description: Super admin only
 *       404:
 *         description: Tenant not found
 */
router.patch(
  '/tenants/:id/plan',
  validate(
    z.object({
      planId:   z.string().uuid().optional(),
      status:   z.enum(['TRIAL', 'ACTIVE', 'EXPIRED', 'CANCELLED']).optional(),
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
 *     parameters:
 *       - in: path
 *         name: tenantId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: List of users in the tenant
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: string }
 *                       email: { type: string }
 *                       name: { type: string, nullable: true }
 *                       isBanned: { type: boolean }
 *                       roleId: { type: string, nullable: true }
 *       403:
 *         description: Super admin only
 *       404:
 *         description: Tenant not found
 */
router.get('/tenants/:tenantId/users', controller.listTenantUsers);

/**
 * @openapi
 * /admin/users/{userId}/ban:
 *   patch:
 *     summary: Ban a user
 *     tags: [SuperAdmin]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: User banned
 *       400:
 *         description: User is already banned or is a super admin
 *       403:
 *         description: Super admin only
 *       404:
 *         description: User not found
 */
router.patch('/users/:userId/ban', controller.banUser);

/**
 * @openapi
 * /admin/users/{userId}/unban:
 *   patch:
 *     summary: Unban a user
 *     tags: [SuperAdmin]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: User unbanned
 *       400:
 *         description: User is not banned
 *       403:
 *         description: Super admin only
 *       404:
 *         description: User not found
 */
router.patch('/users/:userId/unban', controller.unbanUser);

/**
 * @openapi
 * /admin/users/{userId}/role:
 *   patch:
 *     summary: Assign a role to a user
 *     tags: [SuperAdmin]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [roleId]
 *             properties:
 *               roleId:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       200:
 *         description: Role assigned
 *       400:
 *         description: Cannot assign role to a super admin
 *       403:
 *         description: Super admin only
 *       404:
 *         description: User or role not found
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
 *     responses:
 *       200:
 *         description: List of super admins
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: string }
 *                       email: { type: string }
 *                       name: { type: string, nullable: true }
 *                       createdAt: { type: string, format: date-time }
 *       403:
 *         description: Super admin only
 */
router.get('/admins', controller.listAdmins);

/**
 * @openapi
 * /admin/admins:
 *   post:
 *     summary: Create a new super admin
 *     tags: [SuperAdmin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: admin@platform.com
 *               password:
 *                 type: string
 *                 minLength: 8
 *                 example: securepassword
 *               name:
 *                 type: string
 *                 example: Platform Admin
 *     responses:
 *       201:
 *         description: Super admin created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: string }
 *                     email: { type: string }
 *                     name: { type: string, nullable: true }
 *       400:
 *         description: Email already in use
 *       403:
 *         description: Super admin only
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
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       204:
 *         description: Super admin deleted
 *       400:
 *         description: Cannot delete your own account or invalid UUID
 *       403:
 *         description: Super admin only
 *       404:
 *         description: Super admin not found
 */
router.delete(
  '/admins/:id',
  validate(z.object({ id: z.string().uuid() }), 'params'),
  controller.deleteAdmin
);

export default router;
