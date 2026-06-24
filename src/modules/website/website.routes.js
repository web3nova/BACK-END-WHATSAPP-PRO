import { Router } from 'express';
import * as websiteController from './website.controller.js';

const router = Router();

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
router.get('/storefront', websiteController.getStorefront);

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
router.get('/pages', websiteController.listPages);

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
router.post('/pages', websiteController.createPage);

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
router.get('/pages/:slug', websiteController.getPage);

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
router.put('/pages/:slug', websiteController.updatePage);

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
router.delete('/pages/:slug', websiteController.deletePage);

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
router.patch('/pages/:slug/publish', websiteController.setPublished);

export default router;
