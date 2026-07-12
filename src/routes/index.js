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
import analyticsRoutes from '../modules/analytics/analytics.routes.js';
import { accept as acceptInviteHandler } from '../modules/team/team.controller.js';
import demoChatRoutes from '../modules/chat/demo.routes.js';
import { streamEvents } from '../modules/conversations/conversation.controller.js';
import * as orderPublicController from '../modules/orders/order.public.controller.js';
import customerAuthRoutes from '../modules/customer-auth/customer-auth.routes.js';
import { customerAuthMiddleware } from '../middleware/customer-auth.middleware.js';

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

// Team invite acceptance — public endpoint (token-based, no JWT needed)
// Registered here alongside /auth so it is definitively before authMiddleware
router.post('/auth/accept-invite', acceptInviteHandler);

// WhatsApp webhook (verified by Meta signature, not JWT)
router.use('/webhook', whatsappRoutes);

// Public storefront endpoints resolve tenant by query/header/domain instead of JWT.
router.use('/website', publicWebsiteRoutes);

// Billing: plans list + Monnify webhook are public (no JWT).
router.use('/billing', billingPublicRoutes);

// Landing page demo chat — public, IP rate limited.
router.use('/chat', demoChatRoutes);

// Public guest checkout — no JWT required.
router.post('/orders/public', orderPublicController.createPublicOrder);

// Customer auth (storefront shoppers) — public signup/login.
router.use('/customer-auth', customerAuthRoutes);

// Customer's own orders — requires customer JWT.
router.get('/orders/my', customerAuthMiddleware, orderPublicController.getMyOrders);

// SSE stream — EventSource cannot set custom headers, so auth is handled
// inline via ?token= query param. Must live before the global authMiddleware.
router.get('/conversations/events', streamEvents);

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
router.use('/team', teamRoutes);

// Analytics — spans website (Dev 2) + customers/conversations (Dev 4) data
router.use('/analytics', analyticsRoutes);

export default router;
