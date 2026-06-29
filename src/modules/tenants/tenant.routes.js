import { Router } from 'express';
import { requireSuperAdmin } from '../../middleware/superadmin.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import * as controller from './tenant.controller.js';
import {
  listTenantsSchema,
  getTenantSchema,
  updateTenantSchema,
  deleteTenantSchema,
} from './tenant.validation.js';

const router = Router();

// authMiddleware + tenantMiddleware are applied globally in routes/index.js

/**
 * @openapi
 * /tenant/me:
 *   get:
 *     summary: Get the authenticated user's own tenant profile
 *     tags: [Tenants]
 *     responses:
 *       200:
 *         description: Tenant profile
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
 *                     name: { type: string }
 *                     slug: { type: string }
 *                     domain: { type: string, nullable: true }
 *                     status: { type: string, enum: [ACTIVE, SUSPENDED, CANCELLED] }
 *       401:
 *         description: Unauthorized
 */
router.get('/me', controller.getOwn);

/**
 * @openapi
 * /tenant/me:
 *   patch:
 *     summary: Update the authenticated user's own tenant profile
 *     tags: [Tenants]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string, minLength: 2 }
 *               domain: { type: string, nullable: true }
 *     responses:
 *       200:
 *         description: Tenant updated
 *       400:
 *         description: Validation error or domain already in use
 */
router.patch('/me', validate(updateTenantSchema, 'body'), controller.updateOwn);

/**
 * @openapi
 * /tenant:
 *   get:
 *     summary: List all tenants (super admin only)
 *     tags: [Tenants]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [ACTIVE, SUSPENDED, CANCELLED] }
 *     responses:
 *       200:
 *         description: Paginated list of tenants
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — super admin only
 */
router.get('/', requireSuperAdmin, validate(listTenantsSchema, 'query'), controller.list);

/**
 * @openapi
 * /tenant/{id}:
 *   get:
 *     summary: Get any tenant by ID (super admin only)
 *     tags: [Tenants]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Tenant details
 *       403:
 *         description: Forbidden — super admin only
 *       404:
 *         description: Tenant not found
 */
router.get('/:id', requireSuperAdmin, validate(getTenantSchema, 'params'), controller.getOne);

/**
 * @openapi
 * /tenant/{id}:
 *   patch:
 *     summary: Update any tenant (super admin only)
 *     tags: [Tenants]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               domain: { type: string, nullable: true }
 *               status: { type: string, enum: [ACTIVE, SUSPENDED, CANCELLED] }
 *     responses:
 *       200:
 *         description: Tenant updated
 *       403:
 *         description: Forbidden — super admin only
 *       404:
 *         description: Tenant not found
 */
router.patch('/:id', requireSuperAdmin, validate(updateTenantSchema, 'body'), controller.update);

/**
 * @openapi
 * /tenant/{id}:
 *   delete:
 *     summary: Delete a tenant and all its data (super admin only)
 *     tags: [Tenants]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       204:
 *         description: Tenant deleted
 *       403:
 *         description: Forbidden — super admin only
 *       404:
 *         description: Tenant not found
 */
router.delete('/:id', requireSuperAdmin, validate(deleteTenantSchema, 'params'), controller.remove);

export default router;
