import { asyncHandler } from '../../common/utils/asyncHandler.js';
import { ok, created } from '../../common/utils/apiResponse.js';
import { BadRequestError } from '../../common/errors/index.js';
import { prisma } from '../../config/prisma.js';
import * as checkoutService from './checkout.service.js';
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
    customerEmail,
    customerAddress,
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

export const getPaymentProviders = asyncHandler(async (req, res) => {
  ok(res, {
    providers: ['paystack', 'bank', 'cash', 'card', 'flutterwave', 'monnify'],
  });
});

export const paystackWebhook = asyncHandler(async (req, res) => {
  res.status(200).send('Webhook received');
  const { event, data } = req.body;
  if (event === 'charge.success' && data?.status === 'success') {
    const reference = data.reference;
    await prisma.payment.updateMany({
      where: { reference },
      data: { status: 'success', providerReference: data.id?.toString() || reference },
    });
  }
});

export const testPayment = asyncHandler(async (req, res) => {
  ok(res, { message: 'Test payment successful', status: 'success' });
});
