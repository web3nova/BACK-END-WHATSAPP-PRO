import { asyncHandler } from '../../common/utils/asyncHandler.js';
import { ok, created } from '../../common/utils/apiResponse.js';
import { BadRequestError } from '../../common/errors/index.js';
import * as checkoutService from './checkout.service.js';
import * as paymentService from '../payments/payment.service.js';
import { logger } from '../../config/logger.js';
import { checkoutInitSchema, paymentInitSchema, completeOrderSchema } from './checkout.validation.js';

export const initializeCheckout = asyncHandler(async (req, res) => {
  const { items, deliveryMethod, paymentMethod, customerName, customerPhone, customerEmail, customerAddress, tenantId } = checkoutInitSchema.parse(req.body);

  const checkout = await checkoutService.initializeCheckout({
    tenantId, items, deliveryMethod,
  });

  created(res, checkout);
});

export const placeOrder = asyncHandler(async (req, res) => {
  const body = checkoutInitSchema.parse(req.body);
  const { items, deliveryMethod, paymentMethod, customerName, customerPhone, customerEmail, customerAddress, tenantId, totalMinor, currency } = body;

  const customerId = req.customer?.id || null;

  const result = await checkoutService.placeOrder({
    tenantId,
    customerId,
    customerName,
    customerPhone,
    customerWhatsapp: body.customerWhatsapp,
    customerEmail,
    customerAddress,
    customerState: body.customerState,
    customerCity: body.customerCity,
    customerPostBox: body.customerPostBox,
    customerLandmark: body.customerLandmark,
    items,
    totalMinor,
    currency: currency || 'NGN',
    deliveryMethod,
    paymentMethod,
  });

  created(res, result);
});

export const getCustomerOrders = asyncHandler(async (req, res) => {
  if (!req.customer) {
    throw new BadRequestError('Authentication required');
  }
  const orders = await checkoutService.getCustomerOrders(req.customer.tenantId, req.customer.id);
  ok(res, orders);
});

export const getCustomerOrder = asyncHandler(async (req, res) => {
  if (!req.customer) {
    throw new BadRequestError('Authentication required');
  }
  const order = await checkoutService.getCustomerOrder(req.customer.tenantId, req.customer.id, req.params.id);
  ok(res, order);
});

export const claimPayment = asyncHandler(async (req, res) => {
  if (!req.customer) {
    throw new BadRequestError('Authentication required');
  }
  const order = await checkoutService.claimPayment(req.customer.tenantId, req.customer.id, req.params.id);
  ok(res, order);
});

export const getPaymentProviders = asyncHandler(async (req, res) => {
  ok(res, {
    providers: ['paystack', 'bank', 'cash', 'card', 'flutterwave', 'monnify'],
  });
});

export const paystackWebhook = asyncHandler(async (req, res) => {
  // Ack immediately; Paystack retries on non-2xx.
  res.status(200).send('Webhook received');

  const signature = req.headers['x-paystack-signature'];
  try {
    await paymentService.handleWebhook('paystack', req.body, signature, req.rawBody);
  } catch (err) {
    logger.error({ err: err.message }, '[checkout] paystack webhook rejected');
  }
});

export const testPayment = asyncHandler(async (req, res) => {
  ok(res, { message: 'Test payment successful', status: 'success' });
});
