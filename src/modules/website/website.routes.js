import { Router } from 'express';
import { requireFeature } from '../../middleware/subscription.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { uploadImage } from '../../middleware/upload.middleware.js';
import * as websiteController from './website.controller.js';
import {
  createPageSchema,
  deleteImageSchema,
  listMediaSchema,
  listPagesSchema,
  listRevisionsSchema,
  mediaParamsSchema,
  pageParamsSchema,
  publishPageSchema,
  revisionParamsSchema,
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
 * /website/image:
 *   delete:
 *     tags: [Website]
 *     summary: Delete a previously uploaded website image from storage
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [storageKey]
 *             properties:
 *               storageKey: { type: string }
 *     responses:
 *       204: { description: Deleted }
 *       403: { description: storageKey does not belong to this tenant }
 */
router.delete(
  '/image',
  validate(deleteImageSchema, 'body'),
  websiteController.deleteImage,
);

/**
 * @openapi
 * /website/media:
 *   get:
 *     tags: [Website]
 *     summary: List this tenant's uploaded website images (media library), newest first
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200: { description: Paginated media list }
 */
router.get('/media', validate(listMediaSchema, 'query'), websiteController.listMedia);

/**
 * @openapi
 * /website/media/{id}:
 *   delete:
 *     tags: [Website]
 *     summary: Delete a media library item
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       204: { description: Deleted }
 *       404: { description: Not found }
 */
router.delete('/media/:id', validate(mediaParamsSchema, 'params'), websiteController.deleteMedia);

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
 * /website/settings/publish:
 *   post:
 *     tags: [Website]
 *     summary: Publish staged draft changes to the live website settings
 *     responses:
 *       200: { description: Published (live) website settings }
 */
router.post('/settings/publish', websiteController.publishSettings);

/**
 * @openapi
 * /website/settings/discard:
 *   post:
 *     tags: [Website]
 *     summary: Discard staged draft changes, reverting the editor to the live settings
 *     responses:
 *       200: { description: Live website settings (draft cleared) }
 */
router.post('/settings/discard', websiteController.discardDraft);

/**
 * @openapi
 * /website/settings/revisions:
 *   get:
 *     tags: [Website]
 *     summary: List saved revisions of this tenant's website settings, newest first
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200: { description: Paginated revision list }
 */
router.get('/settings/revisions', validate(listRevisionsSchema, 'query'), websiteController.listRevisions);

/**
 * @openapi
 * /website/settings/revisions/{id}/restore:
 *   post:
 *     tags: [Website]
 *     summary: Restore website settings to a previous revision (itself creates a new revision of the current state)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Restored settings }
 *       404: { description: Revision not found }
 */
router.post('/settings/revisions/:id/restore', validate(revisionParamsSchema, 'params'), websiteController.restoreRevision);

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
 * /website/storefront/bank-details:
 *   get:
 *     tags: [Website]
 *     summary: Public — bank transfer account details, fetched on demand at checkout (not part of the general storefront payload)
 *     responses:
 *       200: { description: Bank account details, or null if manual payment isn't active }
 *       404: { description: Business profile not set up }
 */
publicWebsiteRoutes.get(
  '/storefront/bank-details',
  validate(storefrontQuerySchema, 'query'),
  websiteController.getStorefrontBankDetails,
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
