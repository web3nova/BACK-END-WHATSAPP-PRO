import { Router } from 'express';
import * as productController from './product.controller.js';

const router = Router();

/**
 * @openapi
 * /products:
 *   get:
 *     tags: [Products]
 *     summary: List products for the tenant
 *     parameters:
 *       - in: query
 *         name: q
 *         schema: { type: string }
 *         description: Search by name
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200: { description: Paginated product list }
 */
router.get('/', productController.list);

/**
 * @openapi
 * /products:
 *   post:
 *     tags: [Products]
 *     summary: Create a new product
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, priceMinor]
 *             properties:
 *               name: { type: string }
 *               description: { type: string }
 *               priceMinor: { type: integer, description: Price in minor currency units (kobo/cents) }
 *               currency: { type: string, default: NGN }
 *               attributes: { type: object }
 *               stock: { type: integer, default: 0 }
 *     responses:
 *       201: { description: Product created }
 */
router.post('/', productController.create);

/**
 * @openapi
 * /products/{id}:
 *   get:
 *     tags: [Products]
 *     summary: Get a product by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Product }
 *       404: { description: Not found }
 */
router.get('/:id', productController.getById);

/**
 * @openapi
 * /products/{id}:
 *   put:
 *     tags: [Products]
 *     summary: Update a product
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Updated product }
 */
router.put('/:id', productController.update);

/**
 * @openapi
 * /products/{id}:
 *   delete:
 *     tags: [Products]
 *     summary: Delete a product
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       204: { description: Deleted }
 */
router.delete('/:id', productController.remove);

export default router;
