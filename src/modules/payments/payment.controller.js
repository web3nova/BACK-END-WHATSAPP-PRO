import { asyncHandler } from '../../common/utils/asyncHandler.js';
import { ok, created } from '../../common/utils/apiResponse.js';
import { BadRequestError } from '../../common/errors/index.js';
import { config } from '../../config/index.js';
import { logger } from '../../config/logger.js';
import * as paymentService from './payment.service.js';

function tenantId(req) {
  const id = req.tenant?.id || req.headers['x-tenant-id'] || process.env.TEST_TENANT_ID || 'test-tenant-id';
  if (!id) throw new BadRequestError('Missing tenant context.');
  return id;
}

export const initialize = asyncHandler(async (req, res) => {
  const tenant = tenantId(req);
  const { orderId, email, provider } = req.body;
  const data = await paymentService.initializePayment(tenant, orderId, email, provider);
  created(res, data);
});

export const getOne = asyncHandler(async (req, res) => {
  const tenant = tenantId(req);
  const payment = await paymentService.getPayment(tenant, req.params.id);
  ok(res, payment);
});

export const webhook = asyncHandler(async (req, res) => {
  res.status(200).send('Webhook received');

  const provider = req.params?.provider || config.payment.provider;
  const signature = req.headers['x-paystack-signature'] || req.headers['x-payment-signature'];
  const payload = req.body;

  try {
    await paymentService.handleWebhook(provider, payload, signature, req.rawBody);
  } catch (error) {
    logger.error({ err: error?.message }, '[payment] webhook processing error');
  }
});
