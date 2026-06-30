import { Router } from 'express';
import multer from 'multer';
import { BadRequestError } from '../../common/errors/index.js';
import { IMAGE_MIME_TYPES } from '../../common/constants/businessProfile.js';
import { validate } from '../../middleware/validate.middleware.js';
import * as businessController from './business.controller.js';
import { createBusinessSchema, updateBusinessSchema } from './business.validation.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (IMAGE_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new BadRequestError('Only JPG and PNG images are accepted.'));
    }
  },
});

/**
 * @openapi
 * /business/categories:
 *   get:
 *     tags: [Business]
 *     summary: List supported business categories
 *     responses:
 *       200: { description: Business category options }
 */
router.get('/categories', businessController.listCategories);

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
 *               category: { type: string, enum: [fashion, beauty, food, electronics, home, health, services, others] }
 *               categoryOther: { type: string }
 *               tagline: { type: string }
 *               description: { type: string }
 *               email: { type: string, format: email }
 *               whatsappNumber: { type: string }
 *               logoUrl: { type: string, format: uri }
 *               settings: { type: object }
 *     responses:
 *       201: { description: Business profile created }
 *       400: { description: Profile already exists }
 */
router.post('/', validate(createBusinessSchema, 'body'), businessController.createProfile);

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
 *               category: { type: string, enum: [fashion, beauty, food, electronics, home, health, services, others] }
 *               categoryOther: { type: string }
 *               tagline: { type: string }
 *               description: { type: string }
 *               email: { type: string, format: email }
 *               whatsappNumber: { type: string }
 *               logoUrl: { type: string, format: uri }
 *               settings: { type: object }
 *     responses:
 *       200: { description: Updated business profile }
 *       404: { description: Profile not found }
 */
router.put('/', validate(updateBusinessSchema, 'body'), businessController.updateProfile);

/**
 * @openapi
 * /business/logo:
 *   post:
 *     tags: [Business]
 *     summary: Upload or replace the business logo
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [logo]
 *             properties:
 *               logo:
 *                 type: string
 *                 format: binary
 *                 description: JPG or PNG image, max 2 MB
 *     responses:
 *       200: { description: Updated business profile }
 *       400: { description: Invalid or missing image }
 *       404: { description: Business profile not found }
 */
router.post('/logo', upload.single('logo'), businessController.uploadLogo);

export default router;
