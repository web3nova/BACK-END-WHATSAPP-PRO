import { BadRequestError } from '../../common/errors/index.js';
import { asyncHandler } from '../../common/utils/asyncHandler.js';
import { ok } from '../../common/utils/apiResponse.js';
import { logger } from '../../config/logger.js';
import * as whatsappService from './whatsapp.service.js';
import { exchangeCodeForAccount } from './embeddedSignup.service.js';

/**
 * Handle Meta's webhook verification request
 */
export const verifyWebhook = (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      logger.info('[whatsapp] webhook verification successful');
      // Meta requires the raw challenge string to be sent back
      return res.status(200).send(challenge);
    } else {
      throw new BadRequestError('Verification failed');
    }
  }

  throw new BadRequestError('Missing parameters');
};

/**
 * POST /whatsapp/connect — Meta Embedded Signup
 * Called by the frontend after the Meta OAuth popup completes.
 * Body: { code, redirectUri, wabaId, phoneNumberId }
 */
export const connect = asyncHandler(async (req, res) => {
  if (!req.tenant) throw new BadRequestError('This endpoint requires a tenant account');
  const { code, redirectUri, wabaId, phoneNumberId } = req.body;
  const result = await exchangeCodeForAccount({
    tenantId: req.tenant.id,
    code,
    redirectUri,
    wabaId,
    phoneNumberId,
  });
  return ok(res, result);
});

/**
 * GET /whatsapp/account — returns the tenant's connected WhatsApp account (no token exposed)
 */
export const getAccount = asyncHandler(async (req, res) => {
  if (!req.tenant) throw new BadRequestError('Tenant required');
  const account = await whatsappService.getAccountWithStatus(req.tenant.id);
  return ok(res, account);
});

export const disconnect = asyncHandler(async (req, res) => {
  const result = await whatsappService.disconnectAccount(req.tenant.id);
  return ok(res, result);
});

/**
 * GET /whatsapp/business-profile — fetch WhatsApp Business Profile from Meta
 */
export const getBusinessProfile = asyncHandler(async (req, res) => {
  if (!req.tenant) throw new BadRequestError('Tenant required');
  const profile = await whatsappService.getBusinessProfile(req.tenant.id);
  return ok(res, profile);
});

/**
 * PUT /whatsapp/business-profile — update WhatsApp Business Profile on Meta
 */
export const updateBusinessProfile = asyncHandler(async (req, res) => {
  if (!req.tenant) throw new BadRequestError('Tenant required');
  const { about, address, description, email, websites, vertical } = req.body;
  const result = await whatsappService.updateBusinessProfile(req.tenant.id, {
    about, address, description, email, websites, vertical,
  });
  return ok(res, result);
});

/**
 * Receive incoming messages from WhatsApp
 */
export const receiveWebhook = (req, res) => {
  // 1. Immediately acknowledge the webhook so Meta doesn't retry
  res.status(200).send('EVENT_RECEIVED');

  // 2. Asynchronously process the payload to not block the response
  const payload = req.body;
  
  if (payload.object === 'whatsapp_business_account') {
    // Pass to service in the background
    whatsappService.processIncoming(payload).catch((error) => {
      logger.error({ err: error?.message }, '[whatsapp] async webhook processing error');
    });
  }
};
