import { z } from 'zod';

export const createOrderSchema = z.object({
  customerId: z.string().uuid().optional().nullable(),
  status: z.enum(['pending', 'confirmed', 'paid', 'fulfilled', 'cancelled']).default('pending'),
  totalMinor: z.number().int().min(0).default(0),
  currency: z.string().length(3).default('NGN'),
  items: z.array(z.any()).default([]), // Flexible items structure (JSON)
  measurements: z.record(z.any()).default({}), // Flexible measurements structure (JSON)
});

export const updateOrderStatusSchema = z.object({
  status: z.enum(['pending', 'confirmed', 'paid', 'fulfilled', 'cancelled']),
});

export const updateOrderSchema = z.object({
  status: z.enum(['pending', 'confirmed', 'paid', 'fulfilled', 'cancelled']).optional(),
  measurements: z.record(z.any()).optional(),
});
