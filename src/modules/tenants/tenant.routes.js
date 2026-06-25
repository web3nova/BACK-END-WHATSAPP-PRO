import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { tenantMiddleware } from '../../middleware/tenant.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import * as controller from './tenant.controller.js';
import {
  listTenantsSchema,
  getTenantSchema,
  updateTenantSchema,
  deleteTenantSchema,
} from './tenant.validation.js';

const router = Router();

// ── Tenant self-service routes ──
router.get('/me',   authMiddleware, tenantMiddleware, controller.getOwn);
router.patch('/me', authMiddleware, tenantMiddleware, validate(updateTenantSchema, 'body'), controller.updateOwn);

// ── Super admin only routes ──
router.get('/',     authMiddleware, validate(listTenantsSchema, 'query'), controller.list);
router.get('/:id',  authMiddleware, validate(getTenantSchema, 'params'),  controller.getOne);
router.patch('/:id',  authMiddleware, validate(updateTenantSchema, 'body'),   controller.update);
router.delete('/:id', authMiddleware, validate(deleteTenantSchema, 'params'), controller.remove);

export default router;