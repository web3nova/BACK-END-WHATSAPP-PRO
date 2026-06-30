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
 *     responses:
 *       200:
 *         description: Array of roles
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
 *                       name: { type: string }
 *                       permissions: { type: array, items: { type: string } }
 *       401:
 *         description: Unauthorized
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
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Role object
 *       400:
 *         description: Invalid UUID
 *       404:
 *         description: Role not found
 */
router.get('/roles/:id', validate(getRoleSchema, 'params'), controller.getOne);

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
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 2
 *                 example: manager
 *               permissions:
 *                 type: array
 *                 items: { type: string }
 *                 example: []
 *     responses:
 *       201:
 *         description: Role created
 *       400:
 *         description: Role name already exists or invalid permissions
 */
router.post('/roles', validate(createRoleSchema, 'body'), controller.create);

/**
 * @openapi
 * /rbac/roles/{id}:
 *   patch:
 *     summary: Update a role
 *     tags: [RBAC]
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
 *               name:
 *                 type: string
 *                 minLength: 2
 *               permissions:
 *                 type: array
 *                 items: { type: string }
 *     responses:
 *       200:
 *         description: Role updated
 *       400:
 *         description: Role name conflict or invalid UUID
 *       404:
 *         description: Role not found
 */
router.patch('/roles/:id', validate(getRoleSchema, 'params'), validate(updateRoleSchema, 'body'), controller.update);

/**
 * @openapi
 * /rbac/roles/{id}:
 *   delete:
 *     summary: Delete a role (unassigns it from all users first)
 *     tags: [RBAC]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       204:
 *         description: Role deleted
 *       400:
 *         description: Invalid UUID
 *       404:
 *         description: Role not found
 */
router.delete('/roles/:id', validate(deleteRoleSchema, 'params'), controller.remove);

/**
 * @openapi
 * /rbac/users/{userId}/role:
 *   patch:
 *     summary: Assign or unassign a role to a user
 *     tags: [RBAC]
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
 *                 nullable: true
 *                 description: Pass null to unassign the current role
 *     responses:
 *       200:
 *         description: Role assigned
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
 *                     roleId: { type: string, nullable: true }
 *       400:
 *         description: Invalid roleId
 *       404:
 *         description: User not found
 */
router.patch('/users/:userId/role', validate(assignRoleSchema, 'body'), controller.assign);

export default router;
