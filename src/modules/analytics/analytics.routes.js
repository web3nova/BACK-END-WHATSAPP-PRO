import { Router } from 'express';
import { validate } from '../../middleware/validate.middleware.js';
import { overviewQuerySchema } from './analytics.validation.js';
import * as analyticsController from './analytics.controller.js';

const router = Router();

/**
 * @openapi
 * /analytics/overview:
 *   get:
 *     tags: [Analytics]
 *     summary: Website visits, traffic sources, customer growth, and WhatsApp message breakdown for the dashboard Analytics page
 *     parameters:
 *       - in: query
 *         name: days
 *         schema: { type: integer, enum: [7, 30, 90, 365], default: 7 }
 *     responses:
 *       200: { description: Analytics overview }
 */
router.get('/overview', validate(overviewQuerySchema, 'query'), analyticsController.getOverview);

export default router;
