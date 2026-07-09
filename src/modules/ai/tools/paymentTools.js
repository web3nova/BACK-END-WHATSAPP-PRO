import crypto from 'node:crypto';
import { prisma } from '../../../config/prisma.js';
import { config } from '../../../config/index.js';

const PAYSTACK_BASE_URL = 'https://api.paystack.co';

// Tool: fetch the business's payment details so the AI can tell customers how to pay.
export const getPaymentDetails = {
  name: 'get_payment_details',
  description:
    'Get the business payment details (bank account for transfer, or online payment options). Call this when the customer asks how to pay, or after they confirm an order and need payment instructions.',
  parameters: {
    type: 'object',
    properties: {},
  },
  async handler(_input, ctx) {
    const config = await prisma.paymentConfig.findUnique({ where: { tenantId: ctx.tenantId } });
    const data = config?.data;
    if (!data) {
      return { configured: false, message: 'No payment method has been set up by the business yet. Ask the customer to hold on while a staff member shares payment details.' };
    }

    const methods = [];

    if (data.manual?.isActive && data.manual.bankAccount) {
      const acct = data.manual.bankAccount;
      methods.push({
        type: 'bank_transfer',
        bankName: acct.bankName,
        accountNumber: acct.accountNumber,
        accountName: acct.accountName,
      });
    }

    if (data.paystack?.isActive) methods.push({ type: 'paystack', note: 'Online card payment available via Paystack checkout link (staff can generate one).' });
    if (data.monnify?.isActive) methods.push({ type: 'monnify', note: 'Online payment available via Monnify (staff can generate a link).' });

    if (!methods.length) {
      return { configured: false, message: 'No active payment method. Tell the customer a staff member will share payment details shortly.' };
    }

    // The business chooses its preferred provider — present that one to the
    // customer first; others are alternatives only if the customer asks.
    const preferred = data.preferredProvider === 'manual' ? 'bank_transfer' : data.preferredProvider;
    methods.sort((a, b) => (a.type === preferred ? -1 : b.type === preferred ? 1 : 0));

    return {
      configured: true,
      preferredMethod: preferred,
      methods,
      instruction: 'Share the FIRST method (the business preferred option) with the customer. Only mention alternatives if the customer asks.',
    };
  },
};

// Tool: generate a real Paystack checkout link for an order.
export const createPaymentLink = {
  name: 'create_payment_link',
  description:
    'Generate an online payment (checkout) link for an existing order. Call this after create_order when the business accepts online payments and the customer wants to pay by card/online. Returns a URL to send to the customer.',
  parameters: {
    type: 'object',
    properties: {
      orderId: { type: 'string', description: 'The order id returned by create_order' },
      email: { type: 'string', description: "Customer email if they provided one. Optional — a placeholder is used if omitted." },
    },
    required: ['orderId'],
  },
  async handler({ orderId, email }, ctx) {
    const order = await prisma.order.findFirst({
      where: { id: orderId, tenantId: ctx.tenantId },
    });
    if (!order) return { error: 'Order not found.' };
    if (['paid', 'fulfilled', 'cancelled'].includes(order.status)) {
      return { error: `Order is already ${order.status}.` };
    }

    // Use the business's own Paystack key so funds go to their account;
    // fall back to the platform key if the tenant has not connected Paystack.
    const cfg = await prisma.paymentConfig.findUnique({ where: { tenantId: ctx.tenantId } });
    const paystack = cfg?.data?.paystack;
    const secretKey = (paystack?.isActive && paystack.secretKey) || config.payment.secretKey;
    if (!secretKey) {
      return { error: 'Online payments are not configured. Share the bank transfer details instead (get_payment_details).' };
    }

    // Paystack requires an email — customers on WhatsApp often have none.
    const customer = order.customerId
      ? await prisma.customer.findUnique({ where: { id: order.customerId } })
      : null;
    const payerEmail = email || customer?.meta?.email
      || `${(customer?.phone || 'customer').replace(/\D/g, '')}@customers.biziq.online`;

    const reference = `pay_${crypto.randomBytes(12).toString('hex')}`;
    const payment = await prisma.payment.create({
      data: {
        tenantId: ctx.tenantId,
        orderId: order.id,
        reference,
        provider: 'paystack',
        amountMinor: order.totalMinor,
        currency: order.currency,
        status: 'pending',
        meta: { provider: 'paystack', orderId: order.id, createdBy: 'ai' },
      },
    });

    const response = await fetch(`${PAYSTACK_BASE_URL}/transaction/initialize`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: payerEmail,
        amount: order.totalMinor,
        currency: order.currency,
        reference,
        metadata: { paymentId: payment.id, orderId: order.id, tenantId: ctx.tenantId, provider: 'paystack' },
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.status) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'failed', meta: { ...payment.meta, initializeError: body.message || 'init failed' } },
      }).catch(() => {});
      return { error: `Could not create payment link: ${body.message || 'provider error'}. Offer bank transfer instead (get_payment_details).` };
    }

    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        providerReference: body?.data?.reference || reference,
        meta: { ...payment.meta, providerResponse: body?.data, initializedAt: new Date().toISOString() },
      },
    });

    const amountMajor = (order.totalMinor / 100).toLocaleString();
    return {
      checkoutUrl: body?.data?.authorization_url,
      amount: `${order.currency} ${amountMajor}`,
      reference,
      instruction: 'Send the checkoutUrl to the customer so they can pay online. Tell them the amount.',
    };
  },
};

export const paymentTools = [getPaymentDetails, createPaymentLink];

export default paymentTools;
