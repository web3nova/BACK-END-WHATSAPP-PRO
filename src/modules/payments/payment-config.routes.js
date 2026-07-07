import { Router } from 'express';
import { validate } from '../../middleware/validate.middleware.js';
import * as paymentConfigController from './payment-config.controller.js';
import { updatePaymentConfigSchema } from './payment-config.validation.js';

const router = Router();

router.get('/', paymentConfigController.getConfig);
router.put('/', validate(updatePaymentConfigSchema, 'body'), paymentConfigController.upsertConfig);
router.get('/banks', paymentConfigController.listBanks);
router.get('/resolve-account', paymentConfigController.resolveAccount);

export default router;
