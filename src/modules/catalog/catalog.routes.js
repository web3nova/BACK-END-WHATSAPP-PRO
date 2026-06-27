import { Router } from 'express';
import multer from 'multer';
import { BadRequestError } from '../../common/errors/index.js';
import { validate } from '../../middleware/validate.middleware.js';
import * as catalogController from './catalog.controller.js';
import {
  catalogParamsSchema,
  ingestCatalogFormSchema,
  listCatalogsSchema,
} from './catalog.validation.js';

// Accept CSV only; cap at 5 MB.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.toLowerCase().endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new BadRequestError('Only .csv files are accepted.'));
    }
  },
});

const router = Router();

/**
 * @openapi
 * /catalog:
 *   get:
 *     tags: [Catalog]
 *     summary: List catalogs for the tenant (metadata only)
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200: { description: Paginated catalog list }
 */
router.get('/', validate(listCatalogsSchema, 'query'), catalogController.list);

/**
 * @openapi
 * /catalog/upload:
 *   post:
 *     tags: [Catalog]
 *     summary: Upload a CSV file and ingest it as a JSONB catalog (used by fetch_catalog AI tool)
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file: { type: string, format: binary, description: CSV file }
 *               name: { type: string, description: Catalog name (defaults to filename) }
 *     responses:
 *       201: { description: Catalog created from CSV }
 *       400: { description: Bad file or parse error }
 */
router.post('/upload', upload.single('file'), catalogController.uploadCSV);

/**
 * @openapi
 * /catalog/form:
 *   post:
 *     tags: [Catalog]
 *     summary: Ingest a catalog from a JSON payload (array of item objects)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, items]
 *             properties:
 *               name: { type: string }
 *               items:
 *                 type: array
 *                 items: { type: object }
 *                 description: Each object is a product/item entry. Include priceMinor (int) or price (float).
 *     responses:
 *       201: { description: Catalog created from form data }
 */
router.post('/form', validate(ingestCatalogFormSchema, 'body'), catalogController.ingestForm);

/**
 * @openapi
 * /catalog/{id}:
 *   get:
 *     tags: [Catalog]
 *     summary: Get a catalog including its full JSONB data payload
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Catalog with data }
 *       404: { description: Not found }
 */
router.get('/:id', validate(catalogParamsSchema, 'params'), catalogController.getById);

/**
 * @openapi
 * /catalog/{id}:
 *   delete:
 *     tags: [Catalog]
 *     summary: Delete a catalog
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       204: { description: Deleted }
 */
router.delete('/:id', validate(catalogParamsSchema, 'params'), catalogController.remove);

export default router;
