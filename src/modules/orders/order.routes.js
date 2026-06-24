import { Router } from 'express';
import * as controller from './order.controller.js';
import validate from '../../middleware/validate.middleware.js';
import {
  createOrderSchema,
  listOrdersQuerySchema,
  orderIdParamSchema,
  updateOrderSchema,
  updateOrderStatusSchema,
} from './order.validation.js';

const router = Router();

router.get('/', validate(listOrdersQuerySchema, 'query'), controller.list);
router.get('/:id', validate(orderIdParamSchema, 'params'), controller.getOne);
router.post('/', validate(createOrderSchema), controller.create);
router.patch('/:id/status', validate(orderIdParamSchema, 'params'), validate(updateOrderStatusSchema), controller.updateStatus);
router.patch('/:id', validate(orderIdParamSchema, 'params'), validate(updateOrderSchema), controller.update);

export default router;
