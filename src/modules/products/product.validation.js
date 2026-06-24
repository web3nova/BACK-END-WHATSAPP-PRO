import { z } from 'zod';

export const createProductSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  priceMinor: z.number().int().min(0),
  currency: z.string().length(3).default('NGN'),
  attributes: z.record(z.unknown()).optional().default({}),
  stock: z.number().int().min(0).default(0),
});

export const updateProductSchema = createProductSchema.partial();
