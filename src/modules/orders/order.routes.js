import { Router } from 'express';
import * as controller from './order.controller.js';
import validate from '../../middleware/validate.middleware.js';
import {
  createOrderSchema,
  listOrdersQuerySchema,
  orderIdParamSchema,
  updateOrderSchema,
  updateOrderStatusSchema,
} from './order.validation.js';

const router = Router();

/**
 * @openapi
 * /orders:
 *   get:
 *     summary: List orders for the tenant
 *     tags: [Orders]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, confirmed, paid, fulfilled, cancelled]
 *       - in: query
 *         name: customerId
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Paginated list of orders
 *       401:
 *         description: Unauthorized
 */
router.get('/', validate(listOrdersQuerySchema, 'query'), controller.list);

/**
 * @openapi
 * /orders/{id}:
 *   get:
 *     summary: Get a single order by ID
 *     tags: [Orders]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Order details
 *       404:
 *         description: Order not found
 */
router.get('/:id', validate(orderIdParamSchema, 'params'), controller.getOne);

/**
 * @openapi
 * /orders:
 *   post:
 *     summary: Create a new order
 *     tags: [Orders]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               customerId:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 *               status:
 *                 type: string
 *                 enum: [pending, confirmed, paid, fulfilled, cancelled]
 *                 default: pending
 *               totalMinor:
 *                 type: integer
 *                 minimum: 0
 *                 default: 0
 *                 description: Amount in the smallest currency unit (e.g. kobo, cents)
 *               currency:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 3
 *                 default: NGN
 *               items:
 *                 type: array
 *                 items: {}
 *               measurements:
 *                 type: object
 *     responses:
 *       201:
 *         description: Order created
 *       400:
 *         description: Validation error
 */
router.post('/', validate(createOrderSchema), controller.create);

/**
 * @openapi
 * /orders/{id}/status:
 *   patch:
 *     summary: Update the status of an order
 *     tags: [Orders]
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
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [pending, confirmed, paid, fulfilled, cancelled]
 *     responses:
 *       200:
 *         description: Status updated
 *       400:
 *         description: Validation error
 *       404:
 *         description: Order not found
 */
router.patch('/:id/status', validate(orderIdParamSchema, 'params'), validate(updateOrderStatusSchema), controller.updateStatus);

/**
 * @openapi
 * /orders/{id}:
 *   patch:
 *     summary: Update order details
 *     tags: [Orders]
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
 *               customerId:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 *               status:
 *                 type: string
 *                 enum: [pending, confirmed, paid, fulfilled, cancelled]
 *               totalMinor:
 *                 type: integer
 *                 minimum: 0
 *               currency:
 *                 type: string
 *               items:
 *                 type: array
 *                 items: {}
 *               measurements:
 *                 type: object
 *     responses:
 *       200:
 *         description: Order updated
 *       400:
 *         description: Validation error
 *       404:
 *         description: Order not found
 */
router.patch('/:id', validate(orderIdParamSchema, 'params'), validate(updateOrderSchema), controller.update);

export default router;
