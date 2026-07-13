import { asyncHandler } from '../../common/utils/asyncHandler.js';
import { ok, created } from '../../common/utils/apiResponse.js';
import { BadRequestError, NotFoundError } from '../../common/errors/index.js';
import { prisma } from '../../config/prisma.js';
import { logger } from '../../config/logger.js';
import * as paymentService from '../payments/payment.service.js';
import { notify } from '../notifications/notification.service.js';
import { sendMessage } from '../whatsapp/whatsapp.service.js';
import { newOrderEmail } from '../../config/emailTemplates.js';

export const createPublicOrder = asyncHandler(async (req, res) => {
  const {
    tenantId, customerName, customerPhone, customerEmail,
    customerAddress, items, totalMinor, currency,
    deliveryMethod, paymentMethod,
  } = req.body;

  if (!tenantId) throw new BadRequestError('tenantId is required');
  if (!customerName || !customerPhone) throw new BadRequestError('customerName and customerPhone are required');
  if (!items?.length) throw new BadRequestError('At least one item is required');
  if (!totalMinor || totalMinor < 1) throw new BadRequestError('Invalid totalMinor');

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, name: true },
  });
  if (!tenant) throw new NotFoundError('Tenant not found');

  const customer = await prisma.customer.upsert({
    where: { tenantId_phone: { tenantId, phone: customerPhone } },
    update: { name: customerName, meta: { email: customerEmail || null, address: customerAddress } },
    create: { tenantId, phone: customerPhone, name: customerName, meta: { email: customerEmail || null, address: customerAddress } },
  });

  const order = await prisma.order.create({
    data: {
      tenantId,
      customerId: customer.id,
      status: paymentMethod === 'cash' ? 'confirmed' : 'pending',
      totalMinor,
      currency: currency || 'NGN',
      items,
      meta: { deliveryMethod: deliveryMethod || null, paymentMethod, customerAddress, customerEmail: customerEmail || null, source: 'storefront' },
    },
    select: {
      id: true, tenantId: true, customerId: true, status: true,
      totalMinor: true, currency: true, items: true, meta: true, createdAt: true,
    },
  });

  // WhatsApp confirmation
  const ref = order.id.slice(0, 8).toUpperCase();
  const amountMajor = (order.totalMinor / 100).toLocaleString('en-NG', { minimumFractionDigits: 2 });
  const itemLines = (order.items || []).map(it => `• ${it.name}${it.quantity ? ` x${it.quantity}` : ''}`);
  sendMessage(tenantId, customerPhone, [
    `🛒 *Order #${ref}*`,
    ...itemLines,
    `Total: *${order.currency} ${amountMajor}*`,
    `Status: ${order.status}`,
    '',
    'We will keep you updated on your order.',
  ].join('\n')).catch(() => {});

  // Notify store owner
  notify(tenantId, {
    type: 'new_order',
    title: `New storefront order from ${customerName}`,
    body: `Order #${ref} for ${amountMajor} — ${paymentMethod || 'pending'} payment`,
    emailSubject: `New order #${ref} — ${amountMajor}`,
    emailHtml: newOrderEmail({ customerName, amount: `${order.currency} ${amountMajor}`, orderRef: ref }),
    metadata: { orderId: order.id },
    outbound: true,
  }).catch(() => {});

  // Initialize online payment
  let payment = null;
  if (paymentMethod === 'paystack' || paymentMethod === 'card') {
    try {
      const providerName = paymentMethod === 'card' ? 'paystack' : paymentMethod;
      const initResult = await paymentService.initializePayment(
        tenantId, order.id,
        customerEmail || `${customerPhone.replace(/[^0-9]/g, '')}@customer.store`,
        providerName,
      );
      payment = {
        provider: initResult.provider,
        reference: initResult.reference,
        checkoutUrl: initResult.checkoutUrl,
        authorization_url: initResult.authorization_url,
        access_code: initResult.accessCode,
      };
    } catch (err) {
      logger.error({ err: err.message, orderId: order.id }, '[order-public] payment init failed');
    }
  }

  // Bank transfer details
  let bankDetails = null;
  if (paymentMethod === 'bank') {
    const paymentConfig = await prisma.paymentConfig.findUnique({
      where: { tenantId },
      select: { data: true },
    });
    if (paymentConfig?.data?.manual?.bankAccount) {
      bankDetails = paymentConfig.data.manual.bankAccount;
    }
  }

  created(res, {
    order: {
      id: order.id,
      status: order.status,
      totalMinor: order.totalMinor,
      currency: order.currency,
      items: order.items,
      reference: ref,
      createdAt: order.createdAt,
    },
    payment,
    bankDetails,
  });
});

const orderSelect = {
  id: true, status: true, totalMinor: true, currency: true, items: true, measurements: true,
  createdAt: true, updatedAt: true,
};

export const getMyOrders = asyncHandler(async (req, res) => {
  if (!req.customer) {
    return res.status(401).json({ success: false, message: 'Authentication required' })
  }
  const { id: customerId, tenantId } = req.customer;
  const orders = await prisma.order.findMany({
    where: { customerId, tenantId },
    orderBy: { createdAt: 'desc' },
    select: orderSelect,
  });
  ok(res, orders.map(o => {
    const m = o.measurements || {}
    return {
      id: o.id,
      reference: o.id.slice(0, 8).toUpperCase(),
      status: o.status,
      totalMinor: o.totalMinor,
      currency: o.currency,
      items: o.items,
      deliveryAddress: m.customerAddress || null,
      deliveryState: m.customerState || null,
      deliveryCity: m.customerCity || null,
      paymentMethod: m.paymentMethod || null,
      deliveryMethod: m.deliveryMethod || null,
      customerName: m.customerName || null,
      customerPhone: m.customerPhone || null,
      customerEmail: m.customerEmail || null,
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
    }
  }));
});
