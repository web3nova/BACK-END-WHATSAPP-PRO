import { Router } from 'express';
import { validate } from '../../middleware/validate.middleware.js';
import { customerAuthMiddleware } from '../../middleware/customer-auth.middleware.js';
import * as reviewController from './review.controller.js';
import {
  productParamsSchema,
  productReviewsQuerySchema,
  submitReviewSchema,
  listReviewsQuerySchema,
  reviewParamsSchema,
  moderateReviewSchema,
} from './review.validation.js';

// Product-scoped routes, mixing three auth levels in one router — mirrors
// checkout.routes.js, which mounts before the global authMiddleware block
// and applies customerAuthMiddleware per-route where needed.
export const productReviewRoutes = Router();

/**
 * @openapi
 * /products/{id}/reviews:
 *   get:
 *     tags: [Reviews]
 *     summary: List approved reviews for a product (public, no auth)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Approved reviews with average rating }
 */
productReviewRoutes.get(
  '/:id/reviews',
  validate(productParamsSchema, 'params'),
  validate(productReviewsQuerySchema, 'query'),
  reviewController.listPublicReviews,
);

/**
 * @openapi
 * /products/{id}/review-eligibility:
 *   get:
 *     tags: [Reviews]
 *     summary: Check whether the authenticated customer may review this product
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Eligibility result }
 */
productReviewRoutes.get(
  '/:id/review-eligibility',
  customerAuthMiddleware,
  validate(productParamsSchema, 'params'),
  reviewController.getEligibility,
);

/**
 * @openapi
 * /products/{id}/reviews:
 *   post:
 *     tags: [Reviews]
 *     summary: Submit a review for a product (customer must have a fulfilled order containing it)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       201: { description: Review created, pending moderation }
 *       400: { description: Not eligible or already reviewed }
 */
productReviewRoutes.post(
  '/:id/reviews',
  customerAuthMiddleware,
  validate(productParamsSchema, 'params'),
  validate(submitReviewSchema, 'body'),
  reviewController.submit,
);

// Dashboard/staff-authed routes — mounted like /coupons, behind the global
// authMiddleware + tenantMiddleware block in routes/index.js.
const router = Router();

/**
 * @openapi
 * /reviews:
 *   get:
 *     tags: [Reviews]
 *     summary: List reviews for the tenant (dashboard moderation queue)
 *     responses:
 *       200: { description: Paginated review list }
 */
router.get('/', validate(listReviewsQuerySchema, 'query'), reviewController.list);

/**
 * @openapi
 * /reviews/{id}:
 *   patch:
 *     tags: [Reviews]
 *     summary: Approve or reject a review
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Updated review }
 */
router.patch(
  '/:id',
  validate(reviewParamsSchema, 'params'),
  validate(moderateReviewSchema, 'body'),
  reviewController.moderate,
);

export default router;
