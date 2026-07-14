import { z } from 'zod';

export const checkoutInitSchema = z.object({
  items: z.array(z.object({
    productId: z.string(),
    name: z.string(),
    priceMinor: z.number().int().min(0),
    quantity: z.number().int().min(1).max(100),
    attributes: z.record(z.any()).optional(),
  })).min(1),
  deliveryMethod: z.string().optional(),
  paymentMethod: z.string().default('paystack'),
  customerName: z.string().min(1),
  customerPhone: z.string().min(1),
  customerWhatsapp: z.string().optional(),
  customerEmail: z.string().email().optional().or(z.literal('')),
  customerAddress: z.string().min(1),
  customerState: z.string().min(1),
  customerCity: z.string().min(1),
  customerPostBox: z.string().optional(),
  customerLandmark: z.string().optional(),
  tenantId: z.string(),
  totalMinor: z.number().int().min(0),
  currency: z.string().default('NGN'),
  couponCode: z.string().trim().optional(),
});

export const validateCouponSchema = z.object({
  tenantId: z.string(),
  code: z.string().trim().min(1),
  items: z.array(z.object({
    productId: z.string(),
    name: z.string().optional(),
    priceMinor: z.number().int().min(0).optional(),
    quantity: z.number().int().min(1).max(100),
    attributes: z.record(z.any()).optional(),
  })).min(1),
});

export const paymentInitSchema = z.object({
  orderId: z.string(),
  paymentMethod: z.string(),
});

export const completeOrderSchema = z.object({
  paymentReference: z.string(),
  paymentProvider: z.string(),
});
