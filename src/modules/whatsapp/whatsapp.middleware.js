import crypto from 'crypto';
import { ForbiddenError } from '../../common/errors/index.js';
import { logger } from '../../config/logger.js';

export const verifySignature = (req, res, next) => {
  try {
    let signatureHeader = req.headers['x-hub-signature-256'] || req.headers['x-hub-signature'];
    if (Array.isArray(signatureHeader)) signatureHeader = signatureHeader[0];
    if (!signatureHeader || typeof signatureHeader !== 'string') {
      return next(new ForbiddenError('Missing X-Hub-Signature-256 header'));
    }

    const parts = signatureHeader.split('=');
    const algo = parts.length === 2 ? parts[0] : 'sha256';
    const signatureHash = parts.length === 2 ? parts[1] : parts[0];

    if (algo !== 'sha256' || !signatureHash) {
      return next(new ForbiddenError('Invalid signature format'));
    }

    const appSecret = process.env.META_APP_SECRET || process.env.WHATSAPP_APP_SECRET;
    if (!appSecret) {
      logger.error('[whatsapp] missing META_APP_SECRET or WHATSAPP_APP_SECRET in environment');
      return next(new ForbiddenError('Server configuration error'));
    }

    const raw = req.rawBody ?? '';
    const expectedHash = crypto.createHmac('sha256', appSecret).update(raw).digest('hex');

    const sigBuf = Buffer.from(signatureHash, 'hex');
    const expBuf = Buffer.from(expectedHash, 'hex');

    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      logger.warn('[whatsapp] webhook signature mismatch');
      return next(new ForbiddenError('Invalid signature'));
    }

    return next();
  } catch (err) {
    return next(new ForbiddenError('Signature verification error'));
  }
};
