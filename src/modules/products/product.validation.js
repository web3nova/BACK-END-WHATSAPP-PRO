import { z } from 'zod';
import { PRODUCT_CATEGORIES } from '../../common/constants/businessProfile.js';

const normalizeCategory = (value) =>
  typeof value === 'string' ? value.trim().toLowerCase().replace(/\s+/g, '-') : value;

const categorySchema = z.preprocess(normalizeCategory, z.enum(PRODUCT_CATEGORIES));

export const listProductsSchema = z.object({
  q: z.string().trim().min(1).optional(),
  category: categorySchema.optional(),
  brand: z.string().trim().min(1).optional(),
  isFeatured: z.coerce.boolean().optional(),
  isActive: z.coerce.boolean().optional(),
  tag: z.string().trim().min(1).optional(),
  collection: z.string().trim().min(1).optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  sort: z.enum(['createdAt', 'priceMinor', 'name', 'sortOrder', '-createdAt', '-priceMinor', '-name', '-sortOrder']).optional(),
});

export const productParamsSchema = z.object({
  id: z.string().uuid(),
});

const specificationSchema = z.object({
  key: z.string().trim().min(1).max(100),
  value: z.string().trim().min(1).max(500),
});

const featureSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(2000),
});

const faqSchema = z.object({
  question: z.string().trim().min(1).max(500),
  answer: z.string().trim().min(1).max(2000),
});

const galleryImageSchema = z.object({
  url: z.string().url(),
  storageKey: z.string().optional(),
});

const seoSchema = z.object({
  title: z.string().trim().max(200).optional(),
  description: z.string().trim().max(500).optional(),
  keywords: z.string().trim().max(500).optional(),
});

const variantSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(200),
  sku: z.string().trim().max(100).optional(),
  priceMinor: z.coerce.number().int().min(0).optional(),
  stock: z.coerce.number().int().min(0).default(0),
  attributes: z.record(z.string()).optional().default({}),
  imageUrl: z.string().url().optional(),
  imageStorageKey: z.string().optional(),
  isActive: z.boolean().optional().default(true),
});

const productShape = {
  name: z.string().trim().min(1).max(200),
  slug: z.string().trim().min(1).max(200).optional(),
  sku: z.string().trim().max(100).optional(),
  barcode: z.string().trim().max(100).optional(),
  hsCode: z.string().trim().max(20).optional(),
  category: categorySchema.optional(),
  brand: z.string().trim().max(100).optional(),
  description: z.string().trim().min(1).max(5000).optional(),
  review: z.string().trim().min(1).max(2000).optional(),
  imageUrl: z.string().url().optional(),
  galleryImages: z.array(galleryImageSchema).optional().default([]),
  price: z.coerce.number().min(0).optional(),
  priceMinor: z.coerce.number().int().min(0).optional(),
  costPrice: z.coerce.number().int().min(0).optional(),
  compareAtPrice: z.coerce.number().int().min(0).optional(),
  currency: z
    .string()
    .trim()
    .length(3)
    .transform((value) => value.toUpperCase())
    .default('NGN'),
  attributes: z.record(z.unknown()).optional().default({}),
  specifications: z.array(specificationSchema).optional().default([]),
  features: z.array(featureSchema).optional().default([]),
  faqs: z.array(faqSchema).optional().default([]),
  seoMetadata: seoSchema.optional().default({}),
  tags: z.array(z.string().trim().min(1).max(50)).optional().default([]),
  collections: z.array(z.string().trim().min(1).max(100)).optional().default([]),
  stock: z.coerce.number().int().min(0).default(0),
  trackStock: z.boolean().optional(),
  unit: z.string().trim().max(50).default('piece'),
  minimumOrderQuantity: z.coerce.number().int().min(1).default(1),
  isActive: z.boolean().optional().default(true),
  isFeatured: z.boolean().optional().default(false),
  sortOrder: z.coerce.number().int().min(0).default(0),
  relatedProductIds: z.array(z.string().uuid()).optional().default([]),
  upsellProductIds: z.array(z.string().uuid()).optional().default([]),
  crossSellProductIds: z.array(z.string().uuid()).optional().default([]),
  variants: z.array(variantSchema).optional().default([]),
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
