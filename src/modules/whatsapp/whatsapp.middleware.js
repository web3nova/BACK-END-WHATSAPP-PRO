import crypto from 'crypto';
import { ForbiddenError } from '../../common/errors/index.js';

/**
 * Middleware to verify Meta's webhook signature.
 * Uses timing-safe comparison to avoid leaking timing information.
 */
export const verifySignature = (req, res, next) => {
  // Accept either header name and normalize arrays
  let signatureHeader = req.headers['x-hub-signature-256'] || req.headers['x-hub-signature'];
  if (Array.isArray(signatureHeader)) signatureHeader = signatureHeader[0];
  if (!signatureHeader || typeof signatureHeader !== 'string') {
    throw new ForbiddenError('Missing X-Hub-Signature-256 header');
  }

  // Header formats: "sha256=<hex>" or just "<hex>"
  const parts = signatureHeader.split('=');
  const algo = parts.length === 2 ? parts[0] : 'sha256';
  const signatureHash = parts.length === 2 ? parts[1] : parts[0];

  if (algo !== 'sha256' || !signatureHash) {
    throw new ForbiddenError('Invalid signature format');
  }

  const appSecret = process.env.META_APP_SECRET || process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) {
    console.error('[WhatsApp Webhook] Missing META_APP_SECRET or WHATSAPP_APP_SECRET in environment');
    throw new ForbiddenError('Server configuration error');
  }

  // Use the raw body (Buffer) set by express.json verify
  const raw = req.rawBody ?? '';
  const expectedHash = crypto.createHmac('sha256', appSecret).update(raw).digest('hex');

  try {
    const sigBuf = Buffer.from(signatureHash, 'hex');
    const expBuf = Buffer.from(expectedHash, 'hex');

    if (sigBuf.length !== expBuf.length) {
      console.warn('[WhatsApp Webhook] Signature length mismatch');
      throw new ForbiddenError('Invalid signature');
    }

    if (!crypto.timingSafeEqual(sigBuf, expBuf)) {
      console.warn('[WhatsApp Webhook] Signature mismatch');
      throw new ForbiddenError('Invalid signature');
    }
  } catch (err) {
    if (err instanceof ForbiddenError) throw err;
    console.warn('[WhatsApp Webhook] Signature verification error', err?.message || err);
    throw new ForbiddenError('Invalid signature');
  }

  next();
};
