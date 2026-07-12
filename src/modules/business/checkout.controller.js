import { asyncHandler } from '../../common/utils/asyncHandler.js';
import { ok, created, noContent } from '../../common/utils/apiResponse.js';
import { BadRequestError } from '../../common/errors/index.js';
import * as checkoutService from './checkout.service.js';
import { checkoutValidation, paymentValidation, completeOrderValidation } from './checkout.validation.js';

// Checkout initialization controller
export const initializeCheckout = asyncHandler(async (req, res) => {
  const { items, deliveryMethod, paymentMethod, metadata } = checkoutValidation.parse(req.body);
  
  // Verify customer is authenticated
  if (!req.customer?.id) {
    throw new BadRequestError('Authentication required to initialize checkout');
  }

  // Initialize checkout with delivery and payment options
  const checkoutData = {
    items,
    deliveryMethod,
    paymentMethod,
    customerId: req.customer.id,
    ipAddress: req.ip,
    userAgent: req.get('User-Agent'),
    timezone: req.get('Timezone') || 'Africa/Lagos',
    ...(metadata || {}),
  };

  const checkout = await checkoutService.initializeCheckout(req.customer.id, checkoutData);
  return created(res, checkout);
});

// Process payment for checkout
export const processPayment = asyncHandler(async (req, res) => {
  const { orderId, paymentMethod, amount, currency, paymentDetails } = paymentValidation.parse(req.body);
  
  // Verify customer is authenticated
  if (!req.customer?.id) {
    throw new BadRequestError('Authentication required to process payment');
  }

  // Process payment
  const payment = await checkoutService.processPayment(req.customer.id, {
    orderId,
    paymentMethod,
    paymentDetails,
    amount,
    currency,
  });

  return created(res, payment);
});

// Mark order as completed after successful payment
export const completeOrder = asyncHandler(async (req, res) => {
  const { paymentReference, paymentProvider, deliveryStatus } = completeOrderValidation.parse(req.body);
  
  // Verify customer is authenticated
  if (!req.customer?.id) {
    throw new BadRequestError('Authentication required to complete order');
  }

  // Find order by payment reference or payment provider
  let orderId;
  if (paymentReference && paymentProvider) {
    const payment = await findPaymentByReferenceAndProvider(paymentReference, paymentProvider);
    if (!payment) {
      throw new BadRequestError('Payment not found');
    }
    orderId = payment.orderId;
  } else {
    throw new BadRequestError('Payment reference and provider are required');
  }

  // Complete the order
  const result = await checkoutService.completeOrder(req.customer.id, orderId);
  return ok(res, result);
});

// Helper function to find payment by reference and provider
async function findPaymentByReferenceAndProvider(reference, provider) {
  return await prisma.payment.findFirst({
    where: {
      provider,
      OR: [
        { providerReference: reference },
        { reference },
      ],
    },
  });
}

// Helper function to get customer's checkouts
export const getCustomerCheckouts = asyncHandler(async (req, res) => {
  if (!req.customer?.id) {
    throw new BadRequestError('Authentication required');
  }

  const checkouts = await getCheckoutsByCustomer(req.customer.id);
  return ok(res, checkouts);
});

// Helper function to get customer's orders
export const getCustomerOrders = asyncHandler(async (req, res) => {
  if (!req.customer?.id) {
    throw new BadRequestError('Authentication required');
  }

  const orders = await getOrdersByCustomer(req.customer.id);
  return ok(res, orders);
});

// Helper: Get checkouts by customer (for mock implementation)
async function getCheckoutsByCustomer(customerId) {
  // This would typically query the database
  // For now, returning a mock response
  return {
    checkoutId: `CH-${Date.now()}`, // Mock checkout ID
    customerId,
    amount: 25000,
    status: 'pending',
    createdAt: new Date(),
  };
}

// Helper: Get orders by customer (for mock implementation)
async function getOrdersByCustomer(customerId) {
  // This would typically query the database
  // For now, returning a mock response
  return [
    {
      id: `ORD-${Date.now()}`, // Mock order ID
      customerId,
      amount: 25000,
      status: 'completed',
      createdAt: new Date(),
      items: [],
    },
  ];
}
