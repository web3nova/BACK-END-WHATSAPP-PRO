import { z } from 'zod';

const moneyCodeSchema = z.string().trim().length(3).transform((value) => value.toUpperCase());
const jsonArraySchema = z.array(z.any()).default([]);
const jsonObjectSchema = z.record(z.any()).default({});
const orderStatusSchema = z.enum(['pending', 'confirmed', 'paid', 'fulfilled', 'cancelled']);

export const orderIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const listOrdersQuerySchema = z.object({
  status: orderStatusSchema.optional(),
  customerId: z.string().uuid().optional(),
});

export const createOrderSchema = z.object({
  customerId: z.string().uuid().optional().nullable(),
  conversationId: z.string().uuid().optional().nullable(),
  quoteId: z.string().uuid().optional().nullable(),
  status: orderStatusSchema.default('pending'),
  totalMinor: z.coerce.number().int().min(0).default(0),
  items: jsonArraySchema,
  currency: moneyCodeSchema.default('NGN'),
  measurements: jsonObjectSchema,
});

export const updateOrderStatusSchema = z.object({
  status: orderStatusSchema,
});

export const updateOrderSchema = z.object({
  customerId: z.string().uuid().optional().nullable(),
  status: orderStatusSchema.optional(),
  totalMinor: z.coerce.number().int().min(0).optional(),
  currency: moneyCodeSchema.optional(),
  items: z.array(z.any()).optional(),
  measurements: z.record(z.any()).optional(),
});
