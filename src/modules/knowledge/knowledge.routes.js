import { Router } from 'express';
import multer from 'multer';
import * as knowledgeController from './knowledge.controller.js';

// Documents are held in memory and streamed to the extractor; cap at 15MB.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

const router = Router();

/**
 * @openapi
 * /knowledge/upload:
 *   post:
 *     tags: [Knowledge]
 *     summary: Upload a document into the knowledge base (RAG ingest)
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file: { type: string, format: binary }
 *     responses:
 *       201: { description: Document ingested }
 */
router.post('/upload', upload.single('file'), knowledgeController.upload);

/**
 * @openapi
 * /knowledge/search:
 *   get:
 *     tags: [Knowledge]
 *     summary: Semantic search over the knowledge base
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: topK
 *         schema: { type: integer, default: 5 }
 *     responses:
 *       200: { description: Matching chunks }
 */
router.get('/search', knowledgeController.search);

/**
 * @openapi
 * /knowledge/documents:
 *   get:
 *     tags: [Knowledge]
 *     summary: List uploaded documents for the tenant
 *     responses:
 *       200: { description: Document list }
 */
router.get('/documents', knowledgeController.listDocuments);
router.post('/:id/retry', knowledgeController.retryDocument);
router.delete('/:id', knowledgeController.deleteDocument);

export default router;
