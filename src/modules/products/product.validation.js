import { z } from 'zod';

export const listProductsSchema = z.object({
  q: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const productParamsSchema = z.object({
  id: z.string().uuid(),
});

export const createProductSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  priceMinor: z.coerce.number().int().min(0),
  currency: z
    .string()
    .trim()
    .length(3)
    .transform((value) => value.toUpperCase())
    .default('NGN'),
  attributes: z.record(z.unknown()).optional().default({}),
  stock: z.coerce.number().int().min(0).default(0),
});

export const updateProductSchema = createProductSchema.partial();
