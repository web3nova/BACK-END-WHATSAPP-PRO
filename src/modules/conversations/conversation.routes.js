import { Router } from 'express';
import multer from 'multer';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { tenantMiddleware } from '../../middleware/tenant.middleware.js';
import * as controller from './conversation.controller.js';

// WhatsApp caps: image 5MB, video/audio/document 16MB — allow 16MB
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 16 * 1024 * 1024 } });

const router = Router();

router.use(authMiddleware, tenantMiddleware);

/**
 * @openapi
 * /conversations:
 *   get:
 *     tags: [Conversations]
 *     summary: List conversations for the tenant
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 25 }
 *     responses:
 *       200: { description: Paginated conversations }
 */
router.get('/', controller.getAll);

/**
 * @openapi
 * /conversations/{id}/messages:
 *   get:
 *     tags: [Conversations]
 *     summary: Get message history for a conversation
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Paginated messages }
 */
router.get('/:id/messages', controller.getHistory);

/**
 * @openapi
 * /conversations/{id}/resolve:
 *   patch:
 *     tags: [Conversations]
 *     summary: Close a conversation
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Conversation resolved }
 */
router.patch('/:id/take-over', controller.takeOver);
router.patch('/:id/release', controller.release);
router.post('/:id/messages', controller.staffMessage);
router.post('/:id/media', upload.single('file'), controller.staffMedia);

export default router;
