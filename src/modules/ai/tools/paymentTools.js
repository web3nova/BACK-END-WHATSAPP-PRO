import crypto from 'node:crypto';
import { prisma } from '../../../config/prisma.js';
import { config } from '../../../config/index.js';

const PAYSTACK_BASE_URL = 'https://api.paystack.co';
const BLOCKRADAR_BASE_URL = 'https://api.blockradar.co/v1';

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
    if (data.blockradar?.isActive) methods.push({ type: 'blockradar', note: 'Crypto payment accepted — call create_crypto_payment_address with the orderId to generate a unique deposit address for this order.' });
    for (const p of data.otherProviders || []) {
      if (p.isActive && p.name) methods.push({ type: 'other', name: p.name, note: `Accepted via ${p.name} — ask a staff member for payment details.` });
    }

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

// Tool: generate a unique, dedicated crypto deposit address for an order via
// Blockradar. Each order gets its OWN address (never reuse one address across
// orders/customers) so a deposit can be traced back to the right order.
export const createCryptoPaymentAddress = {
  name: 'create_crypto_payment_address',
  description:
    'Generate a unique crypto deposit address for an existing order when the business accepts crypto (Blockradar) and the customer wants to pay that way. Returns a one-time address to send to the customer.',
  parameters: {
    type: 'object',
    properties: {
      orderId: { type: 'string', description: 'The order id returned by create_order' },
    },
    required: ['orderId'],
  },
  async handler({ orderId }, ctx) {
    const order = await prisma.order.findFirst({ where: { id: orderId, tenantId: ctx.tenantId } });
    if (!order) return { error: 'Order not found.' };
    if (['paid', 'fulfilled', 'cancelled'].includes(order.status)) {
      return { error: `Order is already ${order.status}.` };
    }

    const cfg = await prisma.paymentConfig.findUnique({ where: { tenantId: ctx.tenantId } });
    const blockradar = cfg?.data?.blockradar;
    if (!blockradar?.isActive || !blockradar.apiKey || !blockradar.walletId) {
      return { error: 'Crypto payment is not fully configured (missing API key or wallet ID). Offer bank transfer instead (get_payment_details).' };
    }

    const ref = order.id.slice(0, 8).toUpperCase();
    const response = await fetch(`${BLOCKRADAR_BASE_URL}/wallets/${blockradar.walletId}/addresses`, {
      method: 'POST',
      headers: { 'x-api-key': blockradar.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `Order ${ref}`,
        metadata: { orderId: order.id, tenantId: ctx.tenantId },
        // Deposits to a dormant (non-indexed) address are NOT detected in real
        // time — always enable indexing before handing an address to a customer.
        enableIndexing: true,
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body?.data?.address) {
      return { error: `Could not generate a crypto address: ${body?.message || 'provider error'}. Offer bank transfer instead (get_payment_details).` };
    }

    const addr = body.data;
    await prisma.payment.create({
      data: {
        tenantId: ctx.tenantId,
        orderId: order.id,
        reference: `crypto_${addr.id}`,
        provider: 'blockradar',
        providerReference: addr.id,
        amountMinor: order.totalMinor,
        currency: order.currency,
        status: 'pending',
        meta: { provider: 'blockradar', orderId: order.id, address: addr.address, blockchain: addr.blockchain?.name, createdBy: 'ai' },
      },
    });

    const amountMajor = (order.totalMinor / 100).toLocaleString();
    return {
      address: addr.address,
      blockchain: addr.blockchain?.name || 'multiple EVM chains',
      amount: `${order.currency} ${amountMajor}`,
      instruction: `Send this address to the customer for order ${ref}, and the equivalent amount to send. This address is unique to their order — do not reuse it for anyone else. Tell them to confirm here once they've sent it, since deposit confirmation is manual right now — a staff member will verify and confirm.`,
    };
  },
};

// Tool: flag a payment that needs manual verification — either a bank
// transfer receipt image, or a customer's text confirmation that they sent a
// crypto payment. The AI never confirms payment itself — the business always
// verifies manual transfers/deposits before fulfilling.
export const reportPaymentReceipt = {
  name: 'report_payment_receipt',
  description:
    'Alert the business team that a payment needs manual verification — a bank transfer receipt image, or a customer confirming by text that they sent a crypto payment. Call this every time you see a receipt image or a customer says they\'ve paid via bank transfer/crypto, whether it looks correct or not. Include everything relevant (amount, account/address, what the customer said or what the receipt shows).',
  parameters: {
    type: 'object',
    properties: {
      orderId: { type: 'string', description: 'Related order id if known' },
      summary: {
        type: 'string',
        description: 'What the receipt shows: amount, sender, recipient bank/account, date/time — and whether it matches the expected payment details and order total, or any concerns (mismatch, unclear, possibly edited).',
      },
    },
    required: ['summary'],
  },
  async handler({ orderId, summary }, ctx) {
    const { notify } = await import('../../notifications/notification.service.js');
    await notify(ctx.tenantId, {
      type: 'payment_received',
      title: 'Payment receipt needs verification',
      body: summary.slice(0, 400),
      emailSubject: 'Customer sent a payment receipt — please verify',
      metadata: { conversationId: ctx.conversationId, ...(orderId ? { orderId } : {}) },
    }).catch(() => {});
    return {
      reported: true,
      note: 'Team notified. Tell the customer their payment will be confirmed shortly once the team verifies the transfer. Do not mark anything as paid.',
    };
  },
};

export const paymentTools = [getPaymentDetails, createPaymentLink, createCryptoPaymentAddress, reportPaymentReceipt];

export default paymentTools;
