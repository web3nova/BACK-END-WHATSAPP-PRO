import crypto from 'node:crypto';
import { prisma } from '../../config/prisma.js';
import { config } from '../../config/index.js';
import { BadRequestError, NotFoundError } from '../../common/errors/index.js';
import { getPaymentProvider, normalizeProviderName } from './providers/index.js';

const paymentSelect = {
  id: true,
  tenantId: true,
  orderId: true,
  reference: true,
  provider: true,
  providerReference: true,
  amountMinor: true,
  currency: true,
  status: true,
  meta: true,
  createdAt: true,
  updatedAt: true,
};

const orderSelect = {
  id: true,
  tenantId: true,
  customerId: true,
  status: true,
  totalMinor: true,
  currency: true,
  createdAt: true,
  updatedAt: true,
};

function mergeMeta(current, patch) {
  return { ...(current || {}), ...patch };
}

async function getOrderForTenant(tenantId, orderId) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, tenantId },
    select: orderSelect,
  });

  if (!order) {
    throw new NotFoundError('Order not found');
  }

  return order;
}

async function getPaymentForTenant(tenantId, paymentId) {
  const payment = await prisma.payment.findFirst({
    where: { id: paymentId, tenantId },
    select: {
      ...paymentSelect,
      order: { select: orderSelect },
    },
  });

  if (!payment) {
    throw new NotFoundError('Payment not found');
  }

  return payment;
}

function buildPaymentReference() {
  return `pay_${crypto.randomBytes(12).toString('hex')}`;
}

export async function initializePayment(tenantId, orderId, email, providerName, options = {}) {
  const provider = getPaymentProvider(providerName);
  const order = await getOrderForTenant(tenantId, orderId);

  if (order.status === 'paid' || order.status === 'fulfilled' || order.status === 'cancelled') {
    throw new BadRequestError('Order is already paid, fulfilled, or cancelled');
  }

  const payment = await prisma.payment.create({
    data: {
      tenantId,
      orderId,
      reference: buildPaymentReference(),
      provider: provider.name,
      providerReference: null,
      amountMinor: order.totalMinor,
      currency: order.currency,
      status: 'pending',
      meta: {
        provider: provider.name,
        orderId,
      },
    },
    select: paymentSelect,
  });

  try {
    const initResult = await provider.initializePayment({
      payment,
      order,
      customerEmail: email,
      callbackUrl: options.callbackUrl,
    });

    const updated = await prisma.payment.update({
      where: { id: payment.id },
      data: {
        providerReference: initResult.providerReference || payment.reference,
        meta: mergeMeta(payment.meta, {
          providerResponse: initResult.rawResponse ?? initResult,
          initializedAt: new Date().toISOString(),
        }),
      },
      select: paymentSelect,
    });

    return {
      paymentId: updated.id,
      provider: updated.provider,
      reference: updated.reference,
      providerReference: updated.providerReference,
      checkoutUrl: initResult.checkoutUrl,
      authorization_url: initResult.checkoutUrl,
      access_code: initResult.accessCode,
      orderId: updated.orderId,
      amountMinor: updated.amountMinor,
      currency: updated.currency,
    };
  } catch (error) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: 'failed',
        meta: mergeMeta(payment.meta, {
          initializeError: error.message,
          failedAt: new Date().toISOString(),
        }),
      },
    }).catch(() => {});

    throw error;
  }
}

export async function handleWebhook(providerName, payload, signature, rawBody) {
  const provider = getPaymentProvider(providerName);
  provider.verifyWebhook({ rawBody, signature, payload });

  const event = provider.mapEvent(payload);
  if (event.status === 'ignored') {
    return { processed: false };
  }

  const providerReference = provider.extractReference(payload);
  if (!providerReference) {
    throw new BadRequestError('Missing provider reference in webhook payload');
  }

  const payment = await prisma.payment.findFirst({
    where: {
      provider: provider.name,
      OR: [{ providerReference }, { reference: providerReference }],
    },
    select: paymentSelect,
  });

  if (!payment) {
    return { processed: false, reason: 'payment-not-found' };
  }

  if (payment.status === event.status) {
    return { processed: true, paymentId: payment.id, status: payment.status };
  }

  await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: event.status,
        providerReference: payment.providerReference || providerReference,
        meta: mergeMeta(payment.meta, {
          webhookEvent: payload?.event || null,
          webhookPayload: payload,
          processedAt: new Date().toISOString(),
        }),
      },
    });

    if (event.status === 'success' && payment.orderId) {
      const order = await tx.order.findUnique({
        where: { id: payment.orderId },
        select: { id: true, status: true },
      });

      if (order && order.status !== 'cancelled') {
        await tx.order.update({
          where: { id: payment.orderId },
          data: { status: 'paid' },
        });
      }
    }
  });

  return { processed: true, paymentId: payment.id, status: event.status };
}

export async function getPayment(tenantId, paymentId) {
  return getPaymentForTenant(tenantId, paymentId);
}

export function getDefaultPaymentProvider() {
  return normalizeProviderName(config.payment.provider);
}
