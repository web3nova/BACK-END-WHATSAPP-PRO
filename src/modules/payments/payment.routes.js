import { Router } from 'express';
import * as controller from './payment.controller.js';
import validate from '../../middleware/validate.middleware.js';
import { initializePaymentSchema, paymentIdParamSchema } from './payment.validation.js';

const router = Router();

router.post('/initialize', validate(initializePaymentSchema), controller.initialize);
router.post('/webhook/:provider?', controller.webhook);
router.get('/:id', validate(paymentIdParamSchema, 'params'), controller.getOne);

export default router;
