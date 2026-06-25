import { Router } from 'express';
import * as controller from './quote.controller.js';
import validate from '../../middleware/validate.middleware.js';
import {
  createQuoteSchema,
  listQuotesQuerySchema,
  quoteIdParamSchema,
  updateQuoteSchema,
  updateQuoteStatusSchema,
} from './quote.validation.js';

const router = Router();

/**
 * @openapi
 * /quotes:
 *   get:
 *     summary: List quotes for the tenant
 *     tags: [Quotes]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [draft, sent, accepted, rejected, cancelled]
 *       - in: query
 *         name: customerId
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Paginated list of quotes
 *       401:
 *         description: Unauthorized
 */
router.get('/', validate(listQuotesQuerySchema, 'query'), controller.list);

/**
 * @openapi
 * /quotes/{id}:
 *   get:
 *     summary: Get a single quote by ID
 *     tags: [Quotes]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Quote details
 *       404:
 *         description: Quote not found
 */
router.get('/:id', validate(quoteIdParamSchema, 'params'), controller.getOne);

/**
 * @openapi
 * /quotes:
 *   post:
 *     summary: Create a new quote
 *     tags: [Quotes]
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
 *                 enum: [draft, sent, accepted, rejected, cancelled]
 *                 default: draft
 *               amountMinor:
 *                 type: integer
 *                 minimum: 0
 *                 default: 0
 *                 description: Amount in the smallest currency unit (e.g. kobo, cents)
 *               currency:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 3
 *                 default: NGN
 *               details:
 *                 type: object
 *     responses:
 *       201:
 *         description: Quote created
 *       400:
 *         description: Validation error
 */
router.post('/', validate(createQuoteSchema), controller.create);

/**
 * @openapi
 * /quotes/{id}/status:
 *   patch:
 *     summary: Update the status of a quote
 *     tags: [Quotes]
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
 *                 enum: [draft, sent, accepted, rejected, cancelled]
 *     responses:
 *       200:
 *         description: Status updated
 *       400:
 *         description: Validation error
 *       404:
 *         description: Quote not found
 */
router.patch('/:id/status', validate(quoteIdParamSchema, 'params'), validate(updateQuoteStatusSchema), controller.updateStatus);

/**
 * @openapi
 * /quotes/{id}:
 *   patch:
 *     summary: Update quote details
 *     tags: [Quotes]
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
 *                 enum: [draft, sent, accepted, rejected, cancelled]
 *               amountMinor:
 *                 type: integer
 *                 minimum: 0
 *               currency:
 *                 type: string
 *               details:
 *                 type: object
 *     responses:
 *       200:
 *         description: Quote updated
 *       400:
 *         description: Validation error
 *       404:
 *         description: Quote not found
 */
router.patch('/:id', validate(quoteIdParamSchema, 'params'), validate(updateQuoteSchema), controller.update);

export default router;
