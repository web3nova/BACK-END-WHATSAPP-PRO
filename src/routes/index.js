import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { tenantMiddleware } from '../middleware/tenant.middleware.js';

// NOTE: AI & Knowledge routers below are owned by Dev 3. Other devs: add your
// imports/mounts in your own sections; please don't edit the Dev 3 lines.
// ── DEV 3 — AI & Knowledge Engine ──────────────────────
import aiRoutes from '../modules/ai/ai.routes.js';
import knowledgeRoutes from '../modules/knowledge/knowledge.routes.js';

// ── DEV 1 — Platform & Tenant ──────────────────────────
import authRoutes from '../modules/auth/auth.routes.js';
import userRoutes from '../modules/users/user.routes.js';
import rbacRoutes from '../modules/rbac/rbac.routes.js';
import tenantRoutes from '../modules/tenants/tenant.routes.js';
import billingRoutes from '../modules/billing/billing.routes.js';
import billingPublicRoutes from '../modules/billing/billing.public.routes.js';
import adminRoutes from '../modules/superadmin/admin.routes.js';

// ── Onboarding ─────────────────────────────────────────
import onboardingRoutes from '../modules/onboarding/onboarding.routes.js';

// ── DEV 2 — Business, Catalog, Website ─────────────────
import businessRoutes from '../modules/business/business.routes.js';
import productRoutes from '../modules/products/product.routes.js';
import inventoryRoutes from '../modules/inventory/inventory.routes.js';
import catalogRoutes from '../modules/catalog/catalog.routes.js';
import websiteRoutes, { publicWebsiteRoutes } from '../modules/website/website.routes.js';

// ── DEV 4 — Conversation, Orders, Payments ─────────────
import whatsappRoutes, { setupRouter as whatsappSetupRoutes } from '../modules/whatsapp/whatsapp.routes.js';
import conversationRoutes from '../modules/conversations/conversation.routes.js';
import customerRoutes from '../modules/customers/customer.routes.js';
import orderRoutes from '../modules/orders/order.routes.js';
import quoteRoutes from '../modules/quotes/quote.routes.js';
import paymentRoutes from '../modules/payments/payment.routes.js';
import paymentConfigRoutes from '../modules/payments/payment-config.routes.js';
import notificationRoutes from '../modules/notifications/notification.routes.js';
import teamRoutes from '../modules/team/team.routes.js';

const router = Router();

// ── Public ─────────────────────────────────────────────
router.get('/health', (_req, res) => res.json({ status: 'ok' }));
router.get('/', (_req, res) =>
  res.json({
    status: 'ok',
    message: 'BACK-END-WHATSAPP-PRO API',
    version: 'v1',
    docs: '/api/v1/docs',
  }),
);

// Auth (public — no JWT required)
router.use('/auth', authRoutes);

// Team invite acceptance (public — token-based, no JWT)
router.use('/team', teamRoutes);

// WhatsApp webhook (verified by Meta signature, not JWT)
router.use('/webhook', whatsappRoutes);

// Public storefront endpoints resolve tenant by query/header/domain instead of JWT.
router.use('/website', publicWebsiteRoutes);

// Billing: plans list + Monnify webhook are public (no JWT).
router.use('/billing', billingPublicRoutes);

// ── Protected (JWT + tenant) ───────────────────────────
// All routes below require a valid access token and an active tenant.
router.use(authMiddleware, tenantMiddleware);

// Dev 3
router.use('/ai', aiRoutes);
router.use('/knowledge', knowledgeRoutes);

// Dev 1
router.use('/users', userRoutes);
router.use('/rbac', rbacRoutes);
router.use('/tenant', tenantRoutes);
router.use('/billing', billingRoutes);
router.use('/admin', adminRoutes);

// Onboarding
router.use('/onboarding', onboardingRoutes);

// Dev 2
router.use('/business', businessRoutes);
router.use('/products', productRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/catalog', catalogRoutes);
router.use('/website', websiteRoutes);

// Dev 4
router.use('/whatsapp', whatsappSetupRoutes);
router.use('/conversations', conversationRoutes);
router.use('/customers', customerRoutes);
router.use('/orders', orderRoutes);
router.use('/quotes', quoteRoutes);
router.use('/payments', paymentRoutes);
router.use('/payment-config', paymentConfigRoutes);
router.use('/notifications', notificationRoutes);

export default router;
