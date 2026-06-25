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
 */
router.get('/roles/:id',    validate(getRoleSchema, 'params'),    controller.getOne);

/**
 * @openapi
 * /rbac/roles:
 *   post:
 *     summary: Create a new role
 *     tags: [RBAC]
 */
router.post('/roles',       validate(createRoleSchema, 'body'),   controller.create);

/**
 * @openapi
 * /rbac/roles/{id}:
 *   patch:
 *     summary: Update a role
 *     tags: [RBAC]
 */
router.patch('/roles/:id',  validate(updateRoleSchema, 'body'),   controller.update);

/**
 * @openapi
 * /rbac/roles/{id}:
 *   delete:
 *     summary: Delete a role
 *     tags: [RBAC]
 */
router.delete('/roles/:id', validate(deleteRoleSchema, 'params'), controller.remove);

/**
 * @openapi
 * /rbac/users/{userId}/role:
 *   patch:
 *     summary: Assign or unassign a role to a user
 *     tags: [RBAC]
 */
router.patch('/users/:userId/role', validate(assignRoleSchema, 'body'), controller.assign);

export default router;