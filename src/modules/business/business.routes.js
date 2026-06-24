import { Router } from 'express';
import * as businessController from './business.controller.js';

const router = Router();

/**
 * @openapi
 * /business:
 *   get:
 *     tags: [Business]
 *     summary: Get the business profile for the current tenant
 *     responses:
 *       200: { description: Business profile }
 *       404: { description: Not found }
 */
router.get('/', businessController.getProfile);

/**
 * @openapi
 * /business:
 *   post:
 *     tags: [Business]
 *     summary: Create business profile (one per tenant)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [displayName]
 *             properties:
 *               displayName: { type: string }
 *               description: { type: string }
 *               logoUrl: { type: string, format: uri }
 *               settings: { type: object }
 *     responses:
 *       201: { description: Business profile created }
 *       400: { description: Profile already exists }
 */
router.post('/', businessController.createProfile);

/**
 * @openapi
 * /business:
 *   put:
 *     tags: [Business]
 *     summary: Update business profile
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               displayName: { type: string }
 *               description: { type: string }
 *               logoUrl: { type: string, format: uri }
 *               settings: { type: object }
 *     responses:
 *       200: { description: Updated business profile }
 *       404: { description: Profile not found }
 */
router.put('/', businessController.updateProfile);

export default router;
