import { prisma } from '../../config/prisma.js';
import { config } from '../../config/index.js';
import { logger } from '../../config/logger.js';
import { NotFoundError, BadRequestError } from '../../common/errors/index.js';
import * as paymentService from '../payments/payment.service.js';
import { notify } from '../notifications/notification.service.js';
import { sendMessage } from '../whatsapp/whatsapp.service.js';
import { newOrderEmail } from '../../config/emailTemplates.js';
import { priceItems } from './checkout.pricing.js';
import { aggregateQuantities, trackedShortages } from './stock.js';
import { resolveDeliveryFee } from './delivery-fees.js';
import { resolveCouponDiscount } from './coupons.js';
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
    select: { theme: true, draft: true },
  });

  // BizBuilder saves into draft and getStorefront serves draft-over-live, so
  // checkout must resolve options from the same merged view or it would
  // reject methods the storefront legitimately offered.
  const liveBuilder = website?.theme?.builder || {};
  const draftBuilder = website?.draft?.theme?.builder;
  const stored = draftBuilder ? { ...liveBuilder, ...draftBuilder } : liveBuilder;
  // Payment config fetch decrypts secrets — skip it when explicit payments exist.
  const hasPayments = Array.isArray(stored.payments) && stored.payments.length > 0;
  const paymentData = hasPayments ? {} : await getTenantPaymentConfig(tenantId);
  const builder = withBuilderDefaults(stored, business, paymentData);

  return {
    business,
    deliveryOptions: builder.delivery,
    paymentOptions: builder.payments,
    deliveryFees: stored.deliveryFees || {},
  };
}

// Determines why a coupon can't be applied, in priority order. Returns null
// when the coupon is valid for the given subtotal (caller still computes the
// discount amount separately via resolveCouponDiscount).
function couponFailureReason(coupon, subtotalMinor) {
  if (!coupon) return 'not_found';
  if (!coupon.active) return 'inactive';
  if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) return 'expired';
  if (coupon.maxUses != null && coupon.usedCount >= coupon.maxUses) return 'max_uses_reached';
  if (coupon.minSubtotal != null && subtotalMinor < coupon.minSubtotal) return 'min_subtotal_not_met';
  return null;
}

async function findCoupon(tenantId, code) {
  if (!code) return null;
  return prisma.coupon.findUnique({
    where: { tenantId_code: { tenantId, code: String(code).toUpperCase() } },
  });
}

export async function validateCoupon({ tenantId, code, items }) {
  const { totalMinor: subtotalMinor } = await priceItems(tenantId, items);
  const coupon = await findCoupon(tenantId, code);
  const reason = couponFailureReason(coupon, subtotalMinor);
  if (reason) {
    return { valid: false, reason };
  }
  const discountMinor = resolveCouponDiscount(coupon, subtotalMinor);
  return { valid: true, discountMinor, code: coupon.code };
}

export async function initializeCheckout({ tenantId, items, deliveryMethod, couponCode, customerState }) {
  const { business, deliveryOptions, paymentOptions, deliveryFees } = await getBusinessSettings(tenantId);

  const { totalMinor: subtotal } = await priceItems(tenantId, items);

  const selectedMethod = deliveryMethod || (deliveryOptions[0] || null);
  const deliveryFee = resolveDeliveryFee(deliveryFees, selectedMethod, customerState);

  // Preview endpoint — an invalid/unknown coupon code is silently ignored
  // (no discount applied) rather than rejecting the checkout preview.
  let discount = 0;
  if (couponCode) {
    const coupon = await findCoupon(tenantId, couponCode);
    discount = resolveCouponDiscount(coupon, subtotal);
  }

  return {
    business: {
      id: business.id,
      name: business.displayName,
      phone: business.phone,
      email: business.email,
    },
    delivery: {
      options: deliveryOptions.map(m => ({ method: m, feeMinor: resolveDeliveryFee(deliveryFees, m, customerState) })),
      selectedMethod,
    },
    payment: {
      availableMethods: paymentOptions,
    },
    pricing: {
      subtotal,
      discount,
      deliveryFee,
      total: subtotal - discount + deliveryFee,
      currency: 'NGN',
    },
  };
}

export async function placeOrder({ tenantId, customerId, customerName, customerPhone, customerWhatsapp, customerEmail, customerAddress, customerState, customerCity, customerPostBox, customerLandmark, items, totalMinor, currency, deliveryMethod, paymentMethod, couponCode }) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, name: true, slug: true },
  });
  if (!tenant) throw new NotFoundError('Tenant not found');

  const priced = await priceItems(tenantId, items);
  const { deliveryOptions, deliveryFees } = await getBusinessSettings(tenantId);
  if (deliveryMethod && !deliveryOptions.includes(deliveryMethod)) {
    throw new BadRequestError('Invalid delivery method');
  }
  const deliveryFeeMinor = resolveDeliveryFee(deliveryFees, deliveryMethod, customerState);

  let coupon = null;
  let discountMinor = 0;
  if (couponCode) {
    coupon = await findCoupon(tenantId, couponCode);
    const reason = couponFailureReason(coupon, priced.totalMinor);
    if (reason) {
      throw new BadRequestError('Invalid coupon code');
    }
    discountMinor = resolveCouponDiscount(coupon, priced.totalMinor);
  }

  const serverTotal = priced.totalMinor - discountMinor + deliveryFeeMinor;
  if (totalMinor && totalMinor !== serverTotal) {
    logger.warn(
      { tenantId, clientTotal: totalMinor, serverTotal },
      '[checkout] client total mismatch — using server-computed total',
    );
  }

  const quantitiesById = aggregateQuantities(items);
  const trackedProducts = await prisma.product.findMany({
    where: { tenantId, id: { in: [...quantitiesById.keys()] } },
    select: { id: true, name: true, stock: true, trackStock: true },
  });
  const shortages = trackedShortages(trackedProducts, quantitiesById);
  if (shortages.length) {
    throw new BadRequestError(`Insufficient stock for ${shortages[0].name}`);
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

  const trackedById = new Map(trackedProducts.filter((p) => p.trackStock).map((p) => [p.id, p]));

  const order = await prisma.$transaction(async (tx) => {
    for (const [productId, qty] of quantitiesById) {
      const product = trackedById.get(productId);
      if (!product) continue;
      const decremented = await tx.product.updateMany({
        where: { id: productId, tenantId, stock: { gte: qty } },
        data: { stock: { decrement: qty } },
      });
      if (decremented.count === 0) {
        throw new BadRequestError(`Insufficient stock for ${product.name}`);
      }
    }

    if (coupon) {
      const updated = await tx.coupon.updateMany({
        where: { id: coupon.id, OR: [{ maxUses: null }, { usedCount: { lt: coupon.maxUses } }] },
        data: { usedCount: { increment: 1 } },
      });
      if (updated.count === 0) throw new BadRequestError('Coupon is no longer valid');
    }

    return tx.order.create({
      data: {
        tenantId,
        customerId: customer.id,
        status: paymentMethod === 'cash' ? 'confirmed' : 'pending',
        totalMinor: serverTotal,
        currency: currency || 'NGN',
        items: priced.items,
        measurements: {
          deliveryMethod: deliveryMethod || null,
          deliveryFeeMinor,
          couponCode: coupon ? coupon.code : null,
          discountMinor,
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

  prisma.abandonedCart.deleteMany({ where: { tenantId, customerId: customer.id } }).catch(() => {});

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
        { callbackUrl: `${config.frontendUrl}${tenant.slug ? `/b/${tenant.slug}` : `/storefront/${tenantId}`}?order=${order.id}` },
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

function toOrderStatusResponse(order) {
  return {
    id: order.id,
    status: order.status,
    totalMinor: order.totalMinor,
    currency: order.currency,
    items: order.items,
    reference: order.id.slice(0, 8).toUpperCase(),
    createdAt: order.createdAt,
    paymentMethod: order.measurements?.paymentMethod || null,
    deliveryMethod: order.measurements?.deliveryMethod || null,
    deliveryFeeMinor: order.measurements?.deliveryFeeMinor ?? null,
    paymentClaimed: !!order.measurements?.paymentClaimed,
  };
}

export async function getCustomerOrder(tenantId, customerId, orderId) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, tenantId, customerId },
    select: orderSelect,
  });
  if (!order) throw new NotFoundError('Order not found');
  return toOrderStatusResponse(order);
}

export async function claimPayment(tenantId, customerId, orderId) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, tenantId, customerId },
    select: orderSelect,
  });
  if (!order) throw new NotFoundError('Order not found');

  if (order.measurements?.paymentMethod !== 'bank') {
    throw new BadRequestError('Only bank-transfer orders can claim payment');
  }
  if (order.status !== 'pending') {
    throw new BadRequestError('Order is not awaiting payment confirmation');
  }

  const alreadyClaimed = !!order.measurements?.paymentClaimed;

  const measurements = {
    ...(order.measurements || {}),
    paymentClaimed: true,
  };

  const updated = await prisma.order.update({
    where: { id: order.id },
    data: { measurements },
    select: orderSelect,
  });

  if (!alreadyClaimed) {
    const ref = order.id.slice(0, 8).toUpperCase();
    notify(tenantId, {
      type: 'payment_claimed',
      title: `Customer says they've paid order #${ref}`,
      body: `Please verify the bank transfer and confirm order #${ref}.`,
      metadata: { orderId: order.id },
      outbound: true,
    }).catch(() => {});
  }

  return toOrderStatusResponse(updated);
}

export async function pingCart(tenantId, customerId, items, totalMinor) {
  if (!items || items.length === 0) {
    await prisma.abandonedCart.deleteMany({ where: { tenantId, customerId } });
    return { tracked: false };
  }

  await prisma.abandonedCart.upsert({
    where: { tenantId_customerId: { tenantId, customerId } },
    create: { tenantId, customerId, items, totalMinor, lastActiveAt: new Date() },
    update: { items, totalMinor, lastActiveAt: new Date(), remindedAt: null, recoveredAt: null },
  });

  return { tracked: true };
}
