import { Router } from 'express';
import { validate } from '../../middleware/validate.middleware.js';
import * as couponController from './coupon.controller.js';
import {
  createCouponSchema,
  updateCouponSchema,
  couponParamsSchema,
} from './coupon.validation.js';

const router = Router();

/**
 * @openapi
 * /coupons:
 *   get:
 *     tags: [Coupons]
 *     summary: List coupons for the tenant
 *     responses:
 *       200: { description: Coupon list }
 */
router.get('/', couponController.list);

/**
 * @openapi
 * /coupons:
 *   post:
 *     tags: [Coupons]
 *     summary: Create a new coupon
 *     responses:
 *       201: { description: Coupon created }
 */
router.post('/', validate(createCouponSchema, 'body'), couponController.create);

/**
 * @openapi
 * /coupons/{id}:
 *   put:
 *     tags: [Coupons]
 *     summary: Update a coupon
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Updated coupon }
 */
router.put(
  '/:id',
  validate(couponParamsSchema, 'params'),
  validate(updateCouponSchema, 'body'),
  couponController.update,
);

/**
 * @openapi
 * /coupons/{id}:
 *   delete:
 *     tags: [Coupons]
 *     summary: Delete a coupon
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       204: { description: Deleted }
 */
router.delete('/:id', validate(couponParamsSchema, 'params'), couponController.remove);

export default router;
