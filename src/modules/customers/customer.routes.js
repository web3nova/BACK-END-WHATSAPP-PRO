import { Router } from 'express';
import * as controller from './customer.controller.js';

const router = Router();

/**
 * @openapi
 * /customers:
 *   get:
 *     tags: [Customers]
 *     summary: List all customers (CRM)
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200: { description: Paginated customers }
 */
router.get('/', controller.list);

/**
 * @openapi
 * /customers/{id}:
 *   get:
 *     tags: [Customers]
 *     summary: Get a single customer
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Customer }
 *       404: { description: Not found }
 */
router.get('/:id', controller.get);

/**
 * @openapi
 * /customers/{id}:
 *   patch:
 *     tags: [Customers]
 *     summary: Update customer name or meta
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Updated customer }
 */
router.patch('/:id', controller.update);

/**
 * @openapi
 * /customers/{id}:
 *   delete:
 *     tags: [Customers]
 *     summary: Delete a customer record
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       204: { description: Deleted }
 */
router.delete('/:id', controller.remove);

export default router;
