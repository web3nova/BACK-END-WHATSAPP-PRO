// src/modules/rbac/rbac.routes.js
import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { tenantMiddleware } from '../../middleware/tenant.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import * as controller from './rbac.controller.js';
import {
  createRoleSchema,
  updateRoleSchema,
  getRoleSchema,
  deleteRoleSchema,
  assignRoleSchema,
} from './rbac.validation.js';

const router = Router();

router.use(authMiddleware, tenantMiddleware);

/**
 * @openapi
 * /rbac/roles:
 *   get:
 *     summary: List all roles for the current tenant
 *     tags: [RBAC]
 */
router.get('/roles', controller.list);

/**
 * @openapi
 * /rbac/roles/{id}:
 *   get:
 *     summary: Get a single role
 *     tags: [RBAC]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 */
router.get('/roles/:id', validate(getRoleSchema), controller.getOne);

/**
 * @openapi
 * /rbac/roles:
 *   post:
 *     summary: Create a new role
 *     tags: [RBAC]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, permissions]
 *             properties:
 *               name:
 *                 type: string
 *                 example: Manager
 *               permissions:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["orders:read", "orders:write"]
 */
router.post('/roles', validate(createRoleSchema), controller.create);

/**
 * @openapi
 * /rbac/roles/{id}:
 *   patch:
 *     summary: Update a role's name or permissions
 *     tags: [RBAC]
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
 *               name:
 *                 type: string
 *                 example: Senior Manager
 *               permissions:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["orders:read", "orders:write", "products:write"]
 */
router.patch('/roles/:id', validate(updateRoleSchema), controller.update);

/**
 * @openapi
 * /rbac/roles/{id}:
 *   delete:
 *     summary: Delete a role (unassigns users first)
 *     tags: [RBAC]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 */
router.delete('/roles/:id', validate(deleteRoleSchema), controller.remove);

/**
 * @openapi
 * /rbac/users/{userId}/role:
 *   patch:
 *     summary: Assign or unassign a role to a user (pass null to unassign)
 *     tags: [RBAC]
 *     parameters:
 *       - in: path
 *         name: userId
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
 *             required: [roleId]
 *             properties:
 *               roleId:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 */
router.patch('/users/:userId/role', validate(assignRoleSchema), controller.assign);

export default router;