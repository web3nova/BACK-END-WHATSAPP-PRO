// src/modules/users/user.routes.js
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
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           example: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           example: 20
 */
router.get('/', validate(listUsersSchema), controller.list);

/**
 * @openapi
 * /users/{id}:
 *   get:
 *     summary: Get a single user
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 */
router.get('/:id', validate(getUserSchema), controller.getOne);

/**
 * @openapi
 * /users:
 *   post:
 *     summary: Create a new user in the current tenant
 *     tags: [Users]
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
 *                 example: newuser@example.com
 *               password:
 *                 type: string
 *                 minLength: 8
 *                 example: password123
 *               name:
 *                 type: string
 *                 example: New User
 *               roleId:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 */
router.post('/', validate(createUserSchema), controller.create);

/**
 * @openapi
 * /users/{id}:
 *   patch:
 *     summary: Update a user
 *     tags: [Users]
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
 *                 example: Updated Name
 *               roleId:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 */
router.patch('/:id', validate(updateUserSchema), controller.update);

/**
 * @openapi
 * /users/{id}:
 *   delete:
 *     summary: Delete a user
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 */
router.delete('/:id', validate(deleteUserSchema), controller.remove);

export default router;