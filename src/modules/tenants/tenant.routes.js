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

// ── Tenant self-service routes (any authenticated tenant user) ──
router.get(
  '/me',
  authMiddleware,
  tenantMiddleware,
  controller.getOwn
);

router.patch(
  '/me',
  authMiddleware,
  tenantMiddleware,
  validate(updateTenantSchema),  // reuses schema but status field ignored in updateOwnTenant
  controller.updateOwn
);

// ── Super admin only routes ──
// Note: superadmin guard will be added via requireSuperAdmin middleware in the superadmin module.
// For now, protected by authMiddleware — tighten when superadmin module is built.
router.get(
  '/',
  authMiddleware,
  validate(listTenantsSchema),
  controller.list
);

router.get(
  '/:id',
  authMiddleware,
  validate(getTenantSchema),
  controller.getOne
);

router.patch(
  '/:id',
  authMiddleware,
  validate(updateTenantSchema),
  controller.update
);

router.delete(
  '/:id',
  authMiddleware,
  validate(deleteTenantSchema),
  controller.remove
);

export default router;