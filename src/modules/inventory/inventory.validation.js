import { z } from 'zod';

export const listInventorySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const inventoryProductParamsSchema = z.object({
  productId: z.string().uuid(),
});

export const adjustInventorySchema = z.object({
  quantity: z.coerce.number().int().min(0),
  operation: z.enum(['set', 'add', 'subtract']).default('set'),
});
