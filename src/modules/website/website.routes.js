import { Router } from 'express';
import { requireFeature } from '../../middleware/subscription.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { uploadImage } from '../../middleware/upload.middleware.js';
import * as websiteController from './website.controller.js';
import {
  createPageSchema,
  listPagesSchema,
  pageParamsSchema,
  publishPageSchema,
  storefrontQuerySchema,
  updateWebsiteSettingsSchema,
  updatePageSchema,
} from './website.validation.js';

export const publicWebsiteRoutes = Router();
const router = Router();

router.use(requireFeature('websiteBuilder'));

/**
 * @openapi
 * /website/settings:
 *   get:
 *     tags: [Website]
 *     summary: Get website builder settings for the tenant
 *     responses:
 *       200: { description: Website settings }
 */
router.get('/settings', websiteController.getSettings);

/**
 * @openapi
 * /website/image:
 *   post:
 *     tags: [Website]
 *     summary: Upload an image (gallery photo, hero background) for the website builder
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
 *                 description: JPG, PNG, WEBP, or GIF image, max 5MB
 *     responses:
 *       200: { description: Uploaded image URL }
 *       400: { description: Invalid or missing image }
 */
router.post('/image', uploadImage, websiteController.uploadImage);

/**
 * @openapi
 * /website/settings:
 *   put:
 *     tags: [Website]
 *     summary: Update website builder settings for the tenant
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               theme: { type: object }
 *               navigation:
 *                 type: array
 *                 items: { type: object }
 *               seo: { type: object }
 *               social: { type: object }
 *               published: { type: boolean }
 *     responses:
 *       200: { description: Updated website settings }
 */
router.put(
  '/settings',
  validate(updateWebsiteSettingsSchema, 'body'),
  websiteController.updateSettings,
);

/**
 * @openapi
 * /website/storefront:
 *   get:
 *     tags: [Website]
 *     summary: Public storefront — business info + published pages + in-stock products
 *     responses:
 *       200: { description: Storefront payload }
 *       404: { description: Business profile not set up }
 */
publicWebsiteRoutes.get(
  '/storefront',
  validate(storefrontQuerySchema, 'query'),
  websiteController.getStorefront,
);

/**
 * @openapi
 * /website/pages:
 *   get:
 *     tags: [Website]
 *     summary: List CMS pages for the tenant
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200: { description: Paginated page list }
 */
router.get('/pages', validate(listPagesSchema, 'query'), websiteController.listPages);

/**
 * @openapi
 * /website/pages:
 *   post:
 *     tags: [Website]
 *     summary: Create a new CMS page
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [slug, title]
 *             properties:
 *               slug: { type: string, description: Lowercase alphanumeric with hyphens, e.g. about-us }
 *               title: { type: string }
 *               content: { type: object, description: Structured page content (blocks, sections, etc.) }
 *               published: { type: boolean, default: false }
 *     responses:
 *       201: { description: Page created }
 *       400: { description: Slug already exists }
 */
router.post('/pages', validate(createPageSchema, 'body'), websiteController.createPage);

/**
 * @openapi
 * /website/pages/{slug}:
 *   get:
 *     tags: [Website]
 *     summary: Get a CMS page by slug
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Page }
 *       404: { description: Not found }
 */
router.get('/pages/:slug', validate(pageParamsSchema, 'params'), websiteController.getPage);

/**
 * @openapi
 * /website/pages/{slug}:
 *   put:
 *     tags: [Website]
 *     summary: Update a CMS page
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Updated page }
 */
router.put(
  '/pages/:slug',
  validate(pageParamsSchema, 'params'),
  validate(updatePageSchema, 'body'),
  websiteController.updatePage,
);

/**
 * @openapi
 * /website/pages/{slug}:
 *   delete:
 *     tags: [Website]
 *     summary: Delete a CMS page
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       204: { description: Deleted }
 */
router.delete('/pages/:slug', validate(pageParamsSchema, 'params'), websiteController.deletePage);

/**
 * @openapi
 * /website/pages/{slug}/publish:
 *   patch:
 *     tags: [Website]
 *     summary: Publish or unpublish a page
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [published]
 *             properties:
 *               published: { type: boolean }
 *     responses:
 *       200: { description: Updated page }
 */
router.patch(
  '/pages/:slug/publish',
  validate(pageParamsSchema, 'params'),
  validate(publishPageSchema, 'body'),
  websiteController.setPublished,
);

export default router;
