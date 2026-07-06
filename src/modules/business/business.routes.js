import { Router } from 'express';
import { validate } from '../../middleware/validate.middleware.js';
import { uploadImage } from '../../middleware/upload.middleware.js';
import * as businessController from './business.controller.js';
import { updateBusinessSchema, businessProfileSchema } from './business.validation.js';

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
 *     summary: Create or update business profile
 *     description: Creates a new business profile or updates an existing one (upsert). Only basic profile fields required — no onboarding wizard fields.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [displayName]
 *             properties:
 *               displayName: { type: string, example: "Ada's Fashion House" }
 *               category: { type: string, enum: [fashion, beauty, food, electronics, home, health, services, others], example: fashion }
 *               categoryOther: { type: string, example: 'Event Planning' }
 *               tagline: { type: string, example: 'Custom Made & Ready To Wear Fashion' }
 *               description: { type: string, example: 'We design high-quality bespoke clothing.' }
 *               email: { type: string, format: email, example: 'hello@adasfashion.com' }
 *               whatsappNumber: { type: string, example: '+2348012345678' }
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
 *       400: { description: Field failed validation }
 *       401: { description: Unauthorized }
 */
router.post('/', validate(businessProfileSchema, 'body'), businessController.createProfile);

/**
 * @openapi
 * /business:
 *   put:
 *     tags: [Business]
 *     summary: Update business profile
 *     description: Update any subset of the business profile fields. All fields optional.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               displayName: { type: string }
 *               category: { type: string, enum: [fashion, beauty, food, electronics, home, health, services, others] }
 *               categoryOther: { type: string }
 *               tagline: { type: string }
 *               description: { type: string }
 *               email: { type: string, format: email }
 *               whatsappNumber: { type: string }
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
