import { Router } from 'express';
import * as inventoryController from './inventory.controller.js';

const router = Router();

/**
 * @openapi
 * /inventory:
 *   get:
 *     tags: [Inventory]
 *     summary: List stock levels for all products in the tenant
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200: { description: Paginated stock list }
 */
router.get('/', inventoryController.list);

/**
 * @openapi
 * /inventory/{productId}:
 *   patch:
 *     tags: [Inventory]
 *     summary: Adjust stock for a product (set / add / subtract)
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [quantity, operation]
 *             properties:
 *               quantity: { type: integer, minimum: 0 }
 *               operation:
 *                 type: string
 *                 enum: [set, add, subtract]
 *                 description: set overwrites, add increments, subtract decrements
 *     responses:
 *       200: { description: Updated stock }
 *       400: { description: Stock cannot go negative }
 *       404: { description: Product not found }
 */
router.patch('/:productId', inventoryController.adjust);

export default router;
