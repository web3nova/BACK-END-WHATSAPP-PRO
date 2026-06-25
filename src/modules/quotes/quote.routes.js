import { Router } from 'express';
import * as controller from './quote.controller.js';
import validate from '../../middleware/validate.middleware.js';
import {
  createQuoteSchema,
  listQuotesQuerySchema,
  quoteIdParamSchema,
  updateQuoteSchema,
  updateQuoteStatusSchema,
} from './quote.validation.js';

const router = Router();

router.get('/', validate(listQuotesQuerySchema, 'query'), controller.list);
router.get('/:id', validate(quoteIdParamSchema, 'params'), controller.getOne);
router.post('/', validate(createQuoteSchema), controller.create);
router.patch('/:id/status', validate(quoteIdParamSchema, 'params'), validate(updateQuoteStatusSchema), controller.updateStatus);
router.patch('/:id', validate(quoteIdParamSchema, 'params'), validate(updateQuoteSchema), controller.update);

export default router;
