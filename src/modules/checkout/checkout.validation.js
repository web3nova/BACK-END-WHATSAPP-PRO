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
  customerEmail: z.string().email().optional().or(z.literal('')),
  customerAddress: z.string().min(1),
  tenantId: z.string(),
});

export const paymentInitSchema = z.object({
  orderId: z.string(),
  paymentMethod: z.string(),
});

export const completeOrderSchema = z.object({
  paymentReference: z.string(),
  paymentProvider: z.string(),
});
