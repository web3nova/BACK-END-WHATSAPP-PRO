import { z } from 'zod';
import { BUSINESS_CATEGORIES } from '../../common/constants/businessProfile.js';

const normalizeCategory = (value) =>
  typeof value === 'string' ? value.trim().toLowerCase().replace(/\s+/g, '-') : value;

const categorySchema = z.preprocess(normalizeCategory, z.enum(BUSINESS_CATEGORIES));

const businessShape = {
  displayName: z.string().trim().min(1).max(100),
  category: categorySchema.optional(),
  categoryOther: z.string().trim().min(1).max(100).optional(),
  tagline: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().min(1).max(2000).optional(),
  email: z.string().trim().email().optional(),
  whatsappNumber: z.string().trim().min(7).max(30).optional(),
  logoUrl: z.string().url().optional(),
  settings: z.record(z.unknown()).optional().default({}),
};

function requireOtherCategoryLabel(data, ctx) {
  if (data.category === 'others' && !data.categoryOther) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['categoryOther'],
      message: 'categoryOther is required when category is others.',
    });
  }
}

export const createBusinessSchema = z.object(businessShape).superRefine(requireOtherCategoryLabel);

export const updateBusinessSchema = z
  .object(businessShape)
  .partial()
  .superRefine(requireOtherCategoryLabel);
