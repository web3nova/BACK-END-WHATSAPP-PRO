import { prisma } from '../../config/prisma.js';
import { logger } from '../../config/logger.js';
import { NotFoundError, BadRequestError } from '../../common/errors/index.js';
import * as paymentService from '../payments/payment.service.js';
import { notify } from '../notifications/notification.service.js';
import { sendMessage } from '../whatsapp/whatsapp.service.js';
import { newOrderEmail } from '../../config/emailTemplates.js';
import { priceItems } from './checkout.pricing.js';
import { getDecryptedConfig } from '../payments/payment-config.service.js';
import { withBuilderDefaults } from '../website/builder-defaults.js';

async function getTenantPaymentConfig(tenantId) {
  const config = await getDecryptedConfig(tenantId);
  return config?.data || {};
}

async function getBusinessSettings(tenantId) {
  const business = await prisma.business.findUnique({
    where: { tenantId },
    select: { id: true, displayName: true, phone: true, email: true, deliveryStructure: true },
  });
  if (!business) throw new NotFoundError('Business not found');

  const website = await prisma.websiteSettings.findUnique({
    where: { businessId: business.id },
    select: { theme: true },
  });

  const stored = website?.theme?.builder || {};
  // Payment config fetch decrypts secrets — skip it when explicit payments exist.
  const hasPayments = Array.isArray(stored.payments) && stored.payments.length > 0;
  const paymentData = hasPayments ? {} : await getTenantPaymentConfig(tenantId);
  const builder = withBuilderDefaults(stored, business, paymentData);

  return { business, deliveryOptions: builder.delivery, paymentOptions: builder.payments };
}

export async function initializeCheckout({ tenantId, items, deliveryMethod }) {
  const { business, deliveryOptions, paymentOptions } = await getBusinessSettings(tenantId);

  const { totalMinor: subtotal } = await priceItems(tenantId, items);

  return {
    business: {
      id: business.id,
      name: business.displayName,
      phone: business.phone,
      email: business.email,
    },
    delivery: {
      options: deliveryOptions,
      selectedMethod: deliveryMethod || (deliveryOptions[0] || null),
    },
    payment: {
      availableMethods: paymentOptions,
    },
    pricing: {
      subtotal,
      total: subtotal,
      currency: 'NGN',
    },
  };
}

export async function placeOrder({ tenantId, customerId, customerName, customerPhone, customerWhatsapp, customerEmail, customerAddress, customerState, customerCity, customerPostBox, customerLandmark, items, totalMinor, currency, deliveryMethod, paymentMethod }) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, name: true },
  });
  if (!tenant) throw new NotFoundError('Tenant not found');

  const priced = await priceItems(tenantId, items);
  if (totalMinor && totalMinor !== priced.totalMinor) {
    logger.warn(
      { tenantId, clientTotal: totalMinor, serverTotal: priced.totalMinor },
      '[checkout] client total mismatch — using server-computed total',
    );
  }

  // Prefer the authenticated customer so orders appear in their "My Orders".
  let customer = customerId
    ? await prisma.customer.findFirst({ where: { id: customerId, tenantId } })
    : null;

  if (!customer) {
    customer = await prisma.customer.findUnique({
      where: { tenantId_phone: { tenantId, phone: customerPhone } },
    });
  }

  if (customer) {
    // Merge — never replace — meta: it also holds passwordHash/passkeys/googleId.
    const meta = {
      ...(customer.meta || {}),
      email: customerEmail || customer.meta?.email || null,
      address: customerAddress,
    };
    customer = await prisma.customer.update({
      where: { id: customer.id },
      data: { name: customer.name || customerName, meta },
    });
  } else {
    customer = await prisma.customer.create({
      data: {
        tenantId,
        phone: customerPhone,
        name: customerName,
        source: 'website',
        meta: { email: customerEmail || null, address: customerAddress },
      },
    });
  }

  const order = await prisma.order.create({
    data: {
      tenantId,
      customerId: customer.id,
      status: paymentMethod === 'cash' ? 'confirmed' : 'pending',
      totalMinor: priced.totalMinor,
      currency: currency || 'NGN',
      items: priced.items,
      measurements: {
        deliveryMethod: deliveryMethod || null,
        paymentMethod,
        customerName,
        customerPhone,
        customerWhatsapp: customerWhatsapp || customerPhone,
        customerEmail: customerEmail || null,
        customerAddress,
        customerState,
        customerCity,
        customerPostBox: customerPostBox || null,
        customerLandmark: customerLandmark || null,
        source: 'storefront',
      },
    },
    select: {
      id: true, tenantId: true, customerId: true, status: true,
      totalMinor: true, currency: true, items: true, measurements: true, createdAt: true,
    },
  });

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

  notify(tenantId, {
    type: 'new_order',
    title: `New storefront order from ${customerName}`,
    body: `Order #${ref} for ${amountMajor} — ${paymentMethod || 'pending'} payment`,
    emailSubject: `New order #${ref} — ${amountMajor}`,
    emailHtml: newOrderEmail({ customerName, amount: `${order.currency} ${amountMajor}`, orderRef: ref }),
    metadata: { orderId: order.id },
    outbound: true,
  }).catch(() => {});

  let payment = null;
  let bankDetails = null;

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
      logger.error({ err: err.message, orderId: order.id }, '[checkout] payment init failed');
    }
  }

  if (paymentMethod === 'bank') {
    const paymentConfig = await getTenantPaymentConfig(tenantId);
    if (paymentConfig?.manual?.bankAccount) {
      bankDetails = paymentConfig.manual.bankAccount;
    }
  }

  return {
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
  };
}

const orderSelect = {
  id: true, status: true, totalMinor: true, currency: true, items: true, measurements: true,
  createdAt: true, updatedAt: true,
};

export async function getCustomerOrders(tenantId, customerId) {
  const orders = await prisma.order.findMany({
    where: { customerId, tenantId },
    orderBy: { createdAt: 'desc' },
    select: orderSelect,
  });
  return orders.map(o => ({
    id: o.id,
    reference: o.id.slice(0, 8).toUpperCase(),
    status: o.status,
    totalMinor: o.totalMinor,
    currency: o.currency,
    items: o.items,
    deliveryAddress: o.measurements?.customerAddress || null,
    deliveryState: o.measurements?.customerState || null,
    deliveryCity: o.measurements?.customerCity || null,
    deliveryPostBox: o.measurements?.customerPostBox || null,
    deliveryLandmark: o.measurements?.customerLandmark || null,
    paymentMethod: o.measurements?.paymentMethod || null,
    deliveryMethod: o.measurements?.deliveryMethod || null,
    customerName: o.measurements?.customerName || null,
    customerPhone: o.measurements?.customerPhone || null,
    customerWhatsapp: o.measurements?.customerWhatsapp || null,
    customerEmail: o.measurements?.customerEmail || null,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  }));
}
