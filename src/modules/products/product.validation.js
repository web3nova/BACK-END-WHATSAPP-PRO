import { z } from 'zod';
import { PRODUCT_CATEGORIES } from '../../common/constants/businessProfile.js';

const normalizeCategory = (value) =>
  typeof value === 'string' ? value.trim().toLowerCase().replace(/\s+/g, '-') : value;

const categorySchema = z.preprocess(normalizeCategory, z.enum(PRODUCT_CATEGORIES));

export const listProductsSchema = z.object({
  q: z.string().trim().min(1).optional(),
  category: categorySchema.optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const productParamsSchema = z.object({
  id: z.string().uuid(),
});

const productShape = {
  name: z.string().trim().min(1).max(200),
  category: categorySchema.optional(),
  description: z.string().trim().min(1).max(2000).optional(),
  review: z.string().trim().min(1).max(2000).optional(),
  imageUrl: z.string().url().optional(),
  price: z.coerce.number().min(0).optional(),
  priceMinor: z.coerce.number().int().min(0).optional(),
  currency: z
    .string()
    .trim()
    .length(3)
    .transform((value) => value.toUpperCase())
    .default('NGN'),
  attributes: z.record(z.unknown()).optional().default({}),
  stock: z.coerce.number().int().min(0).default(0),
};

function normalizePrice(data, ctx) {
  if (data.priceMinor === undefined && data.price === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['priceMinor'],
      message: 'Provide priceMinor or price.',
    });
    return z.NEVER;
  }

  const { price, ...product } = data;
  return {
    ...product,
    priceMinor: product.priceMinor ?? Math.round(price * 100),
  };
}

export const createProductSchema = z.object(productShape).transform(normalizePrice);

export const updateProductSchema = z
  .object(productShape)
  .partial()
  .transform((data) => {
    const product = { ...data };
    delete product.price;

    if (data.priceMinor !== undefined || data.price === undefined) {
      return product;
    }
    return { ...product, priceMinor: Math.round(data.price * 100) };
  });
