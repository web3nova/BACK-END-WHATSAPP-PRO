import { Router } from 'express';

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
import adminRoutes from '../modules/superadmin/admin.routes.js';

// ── DEV 2 — Business, Catalog, Website ─────────────────
import businessRoutes from '../modules/business/business.routes.js';
import productRoutes from '../modules/products/product.routes.js';
import inventoryRoutes from '../modules/inventory/inventory.routes.js';
import catalogRoutes from '../modules/catalog/catalog.routes.js';
import websiteRoutes from '../modules/website/website.routes.js';

// ── DEV 4 — Conversation, Orders, Payments ─────────────
import whatsappRoutes from '../modules/whatsapp/whatsapp.routes.js';
import conversationRoutes from '../modules/conversations/conversation.routes.js';
import customerRoutes from '../modules/customers/customer.routes.js';
import orderRoutes from '../modules/orders/order.routes.js';
import quoteRoutes from '../modules/quotes/quote.routes.js';
import paymentRoutes from '../modules/payments/payment.routes.js';
import notificationRoutes from '../modules/notifications/notification.routes.js';

const router = Router();

router.get('/health', (_req, res) => res.json({ status: 'ok' }));

// Dev 3
router.use('/ai', aiRoutes);
router.use('/knowledge', knowledgeRoutes);

// Dev 1
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/rbac', rbacRoutes);
router.use('/tenant', tenantRoutes);
router.use('/billing', billingRoutes);
router.use('/admin', adminRoutes);

// Dev 2
router.use('/business', businessRoutes);
router.use('/products', productRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/catalog', catalogRoutes);
router.use('/website', websiteRoutes);

// Dev 4
router.use('/webhook', whatsappRoutes);
router.use('/conversations', conversationRoutes);
router.use('/customers', customerRoutes);
router.use('/orders', orderRoutes);
router.use('/quotes', quoteRoutes);
router.use('/payments', paymentRoutes);
router.use('/notifications', notificationRoutes);

export default router;
