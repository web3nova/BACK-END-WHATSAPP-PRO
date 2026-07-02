import { Router } from 'express';
import { validate } from '../../middleware/validate.middleware.js';
import { uploadImage } from '../../middleware/upload.middleware.js';
import * as businessController from './business.controller.js';
import { createBusinessSchema, updateBusinessSchema } from './business.validation.js';

const router = Router();

/**
 * @openapi
 * /business/categories:
 *   get:
 *     tags: [Business]
 *     summary: List supported business categories
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Business category options
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: array
 *                   items: { type: string, enum: [fashion, beauty, food, electronics, home, health, services, others] }
 *       401: { description: Unauthorized }
 */
router.get('/categories', businessController.listCategories);

/**
 * @openapi
 * /business:
 *   get:
 *     tags: [Business]
 *     summary: Get the business profile for the current tenant
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Business profile
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   $ref: '#/components/schemas/Business'
 *       401: { description: Unauthorized }
 *       404: { description: Not found }
 */
router.get('/', businessController.getProfile);

/**
 * @openapi
 * /business:
 *   post:
 *     tags: [Business]
 *     summary: Create business profile (one per tenant)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/BusinessCreateInput'
 *     responses:
 *       201:
 *         description: Business profile created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   $ref: '#/components/schemas/Business'
 *       400: { description: Profile already exists, or a field failed validation }
 *       401: { description: Unauthorized }
 */
router.post('/', validate(createBusinessSchema, 'body'), businessController.createProfile);

/**
 * @openapi
 * /business:
 *   put:
 *     tags: [Business]
 *     summary: Update business profile
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/BusinessUpdateInput'
 *     responses:
 *       200:
 *         description: Updated business profile
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   $ref: '#/components/schemas/Business'
 *       401: { description: Unauthorized }
 *       404: { description: Profile not found }
 */
router.put('/', validate(updateBusinessSchema, 'body'), businessController.updateProfile);

/**
 * @openapi
 * /business/logo:
 *   post:
 *     tags: [Business]
 *     summary: Upload or replace the business logo
 *     description: Upload a logo image (jpeg/png/webp/gif, max 5MB). Returns the updated business profile.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [image]
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: Logo image
 *     responses:
 *       200:
 *         description: Updated business profile
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   $ref: '#/components/schemas/Business'
 *       400:
 *         description: No file or unsupported file type
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Business profile not found
 */
router.post('/logo', uploadImage, businessController.uploadLogo);

export default router;
