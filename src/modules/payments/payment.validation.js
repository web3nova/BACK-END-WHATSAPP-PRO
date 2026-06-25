import { z } from 'zod';

export const initializePaymentSchema = z.object({
  orderId: z.string().uuid(),
  email: z.string().email(),
  provider: z.string().trim().min(1).optional(),
});

export const paymentIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const webhookProviderParamSchema = z.object({
  provider: z.string().trim().min(1).optional(),
});
