const { z } = require('zod');

// Checkout initialization validation
const checkoutValidation = z.object({
  // Order items with validation
  items: z.array(z.object({
    id: z.string(),
    name: z.string(),
    priceMinor: z.number().int().min(0),
    quantity: z.number().int().min(1).max(100),
    imageUrl: z.string().url().optional(),
  })),

  // Delivery method with validation
  deliveryMethod: z.enum(['standard', 'express', 'same-day', 'international']).default('standard'),

  // Payment method with validation
  paymentMethod: z.enum(['paystack', 'monnify', 'card', 'wallet']).default('paystack'),

  // Optional metadata for checkout
  metadata: z.object({
    ipAddress: z.string().ip().optional(),
    userAgent: z.string().optional(),
    timezone: z.string().optional(),
    couponCode: z.string().optional(),
  }).optional(),
});

// Payment initialization validation
const paymentValidation = z.object({
  orderId: z.string(),
  paymentMethod: z.enum(['paystack', 'monnify', 'card', 'wallet']).default('paystack'),
  amount: z.number().int().min(1),
  currency: z.string().default('NGN'),
  paymentDetails: z.object({
    cardNumber: z.string().optional(),
    expiryMonth: z.string().optional(),
    expiryYear: z.string().optional(),
    cvv: z.string().optional(),
    accountDetails: z.object({
      bankAccountNumber: z.string().optional(),
      bankCode: z.string().optional(),
    }).optional(),
  }).optional(),
});

// Order completion validation
const completeOrderValidation = z.object({
  paymentReference: z.string().optional(),
  paymentProvider: z.enum(['paystack', 'monnify', 'card', 'wallet']).optional(),
  deliveryStatus: z.enum(['pending', 'shipped', 'delivered', 'cancelled']).optional(),
});

module.exports = {
  checkoutValidation,
  paymentValidation,
  completeOrderValidation,
};