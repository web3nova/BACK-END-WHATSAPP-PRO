import { Router } from 'express';
import multer from 'multer';
import * as controller from './whatsapp.controller.js';
import * as commerceController from './commerce.controller.js';
import { verifySignature } from './whatsapp.middleware.js';
import { BadRequestError } from '../../common/errors/index.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const uploadProfilePic = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!['image/jpeg', 'image/png'].includes(file.mimetype)) {
      return cb(new BadRequestError('WhatsApp profile photos must be JPG or PNG.'));
    }
    cb(null, true);
  },
});

// ── Public: Meta webhook (no JWT — verified by signature) ──────────────
const router = Router();

/**
 * @openapi
 * /webhook:
 *   get:
 *     summary: Verify WhatsApp Webhook
 *     tags: [WhatsApp]
 *     parameters:
 *       - in: query
 *         name: hub.mode
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: hub.verify_token
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: hub.challenge
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Webhook verified
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 */
router.get('/', controller.verifyWebhook);

/**
 * @openapi
 * /webhook:
 *   post:
 *     summary: Receive WhatsApp Messages
 *     tags: [WhatsApp]
 *     responses:
 *       200:
 *         description: Message received
 */
router.post('/', verifySignature, controller.receiveWebhook);

// ── Protected: WhatsApp business setup (JWT + tenant required) ──────────
export const setupRouter = Router();

/**
 * @openapi
 * /whatsapp/connect:
 *   post:
 *     summary: Connect WhatsApp via Meta Embedded Signup
 *     tags: [WhatsApp]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code, wabaId, phoneNumberId]
 *             properties:
 *               code:
 *                 type: string
 *                 description: OAuth code from Meta Embedded Signup popup
 *               redirectUri:
 *                 type: string
 *               wabaId:
 *                 type: string
 *                 description: WhatsApp Business Account ID from Meta
 *               phoneNumberId:
 *                 type: string
 *                 description: Phone Number ID from Meta
 *     responses:
 *       200:
 *         description: WhatsApp account connected
 */
setupRouter.get('/account', controller.getAccount);
setupRouter.post('/connect', controller.connect);
setupRouter.delete('/disconnect', controller.disconnect);
setupRouter.get('/business-profile', controller.getBusinessProfile);
setupRouter.put('/business-profile', controller.updateBusinessProfile);
setupRouter.post('/profile-picture', uploadProfilePic.single('image'), controller.uploadProfilePicture);
setupRouter.post('/display-name', controller.requestDisplayNameChange);

// ── Commerce / Catalog ────────────────────────────────────────────
setupRouter.get('/commerce', commerceController.getCommerceStatus);
setupRouter.post('/commerce/detect', commerceController.detectCommerce);
setupRouter.post('/commerce/setup', commerceController.setupCommerce);
setupRouter.post('/commerce/enable', commerceController.enableCommerceHandler);
setupRouter.post('/commerce/sync', commerceController.syncArrangement);

// Arrangements
setupRouter.get('/catalog/arrangements', commerceController.listArrangements);
setupRouter.post('/catalog/arrangements', commerceController.createArrangement);
setupRouter.get('/catalog/arrangements/:id', commerceController.getArrangement);
setupRouter.put('/catalog/arrangements/:id', commerceController.updateArrangement);
setupRouter.delete('/catalog/arrangements/:id', commerceController.deleteArrangement);
setupRouter.post('/catalog/arrangements/:id/set-default', commerceController.setDefaultArrangement);

// Sections
setupRouter.get('/catalog/arrangements/:arrangementId/sections', commerceController.listSections);
setupRouter.post('/catalog/sections', commerceController.createSection);
setupRouter.put('/catalog/sections/:id', commerceController.updateSection);
setupRouter.delete('/catalog/sections/:id', commerceController.deleteSection);
setupRouter.put('/catalog/sections/reorder', commerceController.reorderSections);

// Items
setupRouter.get('/catalog/sections/:sectionId/items', commerceController.listItems);
setupRouter.post('/catalog/items', commerceController.addItem);
setupRouter.delete('/catalog/items/:id', commerceController.removeItem);
setupRouter.put('/catalog/items/reorder', commerceController.reorderItems);

// Customer-facing catalog
setupRouter.get('/catalog/for-customer', commerceController.getCatalogForCustomer);

export default router;
