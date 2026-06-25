import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { tenantMiddleware } from '../../middleware/tenant.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import * as controller from './user.controller.js';
import {
  listUsersSchema,
  getUserSchema,
  createUserSchema,
  updateUserSchema,
  deleteUserSchema,
} from './user.validation.js';

const router = Router();

router.use(authMiddleware, tenantMiddleware);

/**
 * @openapi
 * /users:
 *   get:
 *     summary: List users in the current tenant
 *     tags: [Users]
 */
router.get('/',     validate(listUsersSchema, 'query'), controller.list);

/**
 * @openapi
 * /users/{id}:
 *   get:
 *     summary: Get a single user
 *     tags: [Users]
 */
router.get('/:id',  validate(getUserSchema, 'params'), controller.getOne);

/**
 * @openapi
 * /users:
 *   post:
 *     summary: Create a new user in the current tenant
 *     tags: [Users]
 */
router.post('/',    validate(createUserSchema, 'body'), controller.create);

/**
 * @openapi
 * /users/{id}:
 *   patch:
 *     summary: Update a user
 *     tags: [Users]
 */
router.patch('/:id', validate(updateUserSchema, 'body'), controller.update);

/**
 * @openapi
 * /users/{id}:
 *   delete:
 *     summary: Delete a user
 *     tags: [Users]
 */
router.delete('/:id', validate(deleteUserSchema, 'params'), controller.remove);

export default router;