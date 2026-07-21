import { Router } from 'express';
import multer from 'multer';
import { BadRequestError } from '../../common/errors/index.js';
import { IMAGE_MIME_TYPES } from '../../common/constants/businessProfile.js';
import { validate } from '../../middleware/validate.middleware.js';
import { requireActiveSubscription } from '../../middleware/subscription.middleware.js';
import * as productController from './product.controller.js';
import {
  createProductSchema,
  listProductsSchema,
  productParamsSchema,
  updateProductSchema,
} from './product.validation.js';

// Public, product-scoped route — mounted before the global auth middleware
// block in routes/index.js, same pattern as reviews' productReviewRoutes.
export const publicProductRoutes = Router();
publicProductRoutes.get(
  '/:id/og',
  validate(productParamsSchema, 'params'),
  productController.getOg,
);

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (IMAGE_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new BadRequestError('Only JPG, PNG, WebP, and HEIC photos are accepted. Please convert your file and try again.'));
    }
  },
});
const uploadCsv = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = file.mimetype === 'text/csv' || file.mimetype === 'application/vnd.ms-excel' || file.originalname?.toLowerCase().endsWith('.csv');
    if (ok) cb(null, true);
    else cb(new BadRequestError('Only .csv files are accepted.'));
  },
});

/**
 * @openapi
 * /products/categories:
 *   get:
 *     tags: [Products]
 *     summary: List supported product categories
 *     responses:
 *       200: { description: Product category options }
 */
router.get('/categories', productController.listCategories);

/**
 * @openapi
 * /products/suggest:
 *   post:
 *     tags: [Products]
 *     summary: AI-generate a description and tags from a product name
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string }
 *               brand: { type: string }
 *     responses:
 *       200: { description: Suggested description and tags }
 */
router.post('/suggest', productController.suggest);

/**
 * @openapi
 * /products/import-csv:
 *   post:
 *     tags: [Products]
 *     summary: Bulk-create products from a CSV file
 *     description: >
 *       Columns (header names are case-insensitive, common aliases accepted):
 *       name (required), price or priceMinor (required), stock, category,
 *       description, brand, sku. Rows missing a name or valid price are
 *       skipped and reported, not fatal to the rest of the import.
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file: { type: string, format: binary }
 *     responses:
 *       200: { description: Import summary — created count and skipped rows with reasons }
 */
router.post('/import-csv', uploadCsv.single('file'), productController.importCsv);

/**
 * @openapi
 * /products:
 *   get:
 *     tags: [Products]
 *     summary: List products for the tenant
 *     parameters:
 *       - in: query
 *         name: q
 *         schema: { type: string }
 *         description: Search by name
 *       - in: query
 *         name: category
 *         schema: { type: string, enum: [best-selling, new-arrival, featured, discount, regular, others] }
 *         description: Filter by product category
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200: { description: Paginated product list }
 */
router.get('/', validate(listProductsSchema, 'query'), productController.list);

/**
 * @openapi
 * /products:
 *   post:
 *     tags: [Products]
 *     summary: Create a new product
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string }
 *               category: { type: string, enum: [best-selling, new-arrival, featured, discount, regular, others] }
 *               description: { type: string }
 *               review: { type: string }
 *               imageUrl: { type: string, format: uri }
 *               price: { type: number, description: Decimal price; converted to minor units when priceMinor is omitted }
 *               priceMinor: { type: integer, description: Price in minor currency units (kobo/cents) }
 *               currency: { type: string, default: NGN }
 *               attributes: { type: object }
 *               stock: { type: integer, default: 0 }
 *     responses:
 *       201: { description: Product created }
 */
router.post(
  '/',
  requireActiveSubscription(),
  validate(createProductSchema, 'body'),
  productController.create,
);

/**
 * @openapi
 * /products/{id}:
 *   get:
 *     tags: [Products]
 *     summary: Get a product by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Product }
 *       404: { description: Not found }
 */
router.get('/:id', validate(productParamsSchema, 'params'), productController.getById);

/**
 * @openapi
 * /products/{id}:
 *   put:
 *     tags: [Products]
 *     summary: Update a product
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Updated product }
 */
router.put(
  '/:id',
  validate(productParamsSchema, 'params'),
  validate(updateProductSchema, 'body'),
  productController.update,
);

/**
 * @openapi
 * /products/{id}/image:
 *   post:
 *     tags: [Products]
 *     summary: Upload or replace a product image
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
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
 *                 description: JPG or PNG image, max 5 MB
 *     responses:
 *       200: { description: Updated product }
 *       400: { description: Invalid or missing image }
 *       404: { description: Product not found }
 */
router.post(
  '/:id/image',
  validate(productParamsSchema, 'params'),
  upload.single('image'),
  productController.uploadImage,
);

/**
 * @openapi
 * /products/{id}:
 *   delete:
 *     tags: [Products]
 *     summary: Delete a product
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       204: { description: Deleted }
 */
router.delete('/:id', validate(productParamsSchema, 'params'), productController.remove);

router.post(
  '/:id/gallery',
  validate(productParamsSchema, 'params'),
  upload.single('image'),
  productController.uploadGalleryImage,
);

router.delete(
  '/:id/gallery',
  validate(productParamsSchema, 'params'),
  productController.removeGalleryImage,
);

// Public: increment product view count (no auth required)
router.post('/:id/view', productController.incrementView);

// Public: get popular/trending products
router.get('/popular/:tenantId', productController.getPopular);

export default router;
