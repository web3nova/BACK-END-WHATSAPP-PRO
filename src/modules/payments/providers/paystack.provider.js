import crypto from 'node:crypto';
import { BadRequestError } from '../../../common/errors/index.js';
import { config } from '../../../config/index.js';

const PAYSTACK_BASE_URL = 'https://api.paystack.co';

function getSecretKey() {
  const secretKey = config.payment.secretKey;
  if (!secretKey) throw new Error('PAYMENT_SECRET_KEY is not configured');
  return secretKey;
}

function getWebhookSecret() {
  return config.payment.webhookSecret || getSecretKey();
}

function safeObject(value) {
  return value && typeof value === 'object' ? value : {};
}

export function createPaystackProvider() {
  return {
    name: 'paystack',

    async initializePayment({ payment, order, customerEmail, callbackUrl }) {
      const response = await fetch(`${PAYSTACK_BASE_URL}/transaction/initialize`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${getSecretKey()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: customerEmail,
          amount: order.totalMinor,
          currency: order.currency,
          reference: payment.reference,
          ...(callbackUrl ? { callback_url: callbackUrl } : {}),
          metadata: {
            paymentId: payment.id,
            orderId: order.id,
            tenantId: payment.tenantId,
            provider: 'paystack',
          },
        }),
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.status) {
        throw new Error(body.message || 'Failed to initialize payment with Paystack');
      }

      return {
        providerReference: body?.data?.reference || payment.reference,
        checkoutUrl: body?.data?.authorization_url,
        accessCode: body?.data?.access_code,
        rawResponse: body,
      };
    },

    verifyWebhook({ rawBody, signature }) {
      if (!signature) {
        throw new BadRequestError('Missing payment webhook signature');
      }

      const computed = crypto
        .createHmac('sha512', getWebhookSecret())
        .update(Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody || '')))
        .digest('hex');

      if (computed !== signature) {
        throw new BadRequestError('Invalid payment webhook signature');
      }
    },

    extractReference(payload) {
      return payload?.data?.reference || payload?.reference || null;
    },

    mapEvent(payload) {
      const event = payload?.event;
      const data = safeObject(payload?.data);

      if (event === 'charge.success' && data.status === 'success') {
        return { status: 'success', payload: data };
      }

      if (event === 'charge.failed' || data.status === 'failed' || data.status === 'abandoned') {
        return { status: 'failed', payload: data };
      }

      return { status: 'ignored', payload: data };
    },
  };
}
