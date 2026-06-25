import { Router } from 'express';

// ============================================================
// Conversations — Owner: Dev 4
// 👉 START HERE. This stub is already mounted in src/routes/index.js.
// Build the matching *.controller.js + *.service.js in this folder,
// then declare routes below.
// Pattern + conventions: docs/architecture.md  (worked example: src/modules/knowledge)
// ============================================================
import * as controller from './conversation.controller.js';

const router = Router();

// Temporary mock tenant middleware for testing before tenant.middleware is implemented.
// It sets req.tenant.id from header `x-tenant-id` or falls back to TEST_TENANT_ID env or a test id.
const mockTenantMiddleware = (req, _res, next) => {
    if (!req.tenant) {
        const fromHeader = req.headers['x-tenant-id'];
        req.tenant = { id: fromHeader || process.env.TEST_TENANT_ID || 'test-tenant-id' };
    }
    next();
};

router.use(mockTenantMiddleware);

/**
 * GET / - list conversations for tenant
 */
router.get('/', controller.getAll);

/**
 * GET /:id/messages - conversation history
 */
router.get('/:id/messages', controller.getHistory);

/**
 * PATCH /:id/resolve - mark conversation closed
 */
router.patch('/:id/resolve', controller.resolve);

export default router;
