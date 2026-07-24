import { z } from 'zod';

export const setupCommerceSchema = z.object({
  businessManagerId: z.string().min(1, 'Business Manager ID is required'),
});

export const syncArrangementSchema = z.object({
  arrangementId: z.string().uuid(),
});

export const createArrangementSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().max(100).optional(),
  description: z.string().max(500).optional(),
  isDefault: z.boolean().optional(),
  customerSegment: z.string().max(100).nullable().optional(),
});

export const updateArrangementSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
  customerSegment: z.string().max(100).nullable().optional(),
});

export const createSectionSchema = z.object({
  arrangementId: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
});

export const updateSectionSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  sortOrder: z.number().int().optional(),
});

export const reorderSectionsSchema = z.object({
  items: z.array(z.object({
    id: z.string().uuid(),
    sortOrder: z.number().int(),
  })),
});

export const addItemSchema = z.object({
  sectionId: z.string().uuid(),
  productId: z.string().uuid(),
  customPriceMinor: z.number().int().nullable().optional(),
  customImageUrl: z.string().max(500).nullable().optional(),
});

export const reorderItemsSchema = z.object({
  items: z.array(z.object({
    id: z.string().uuid(),
    sortOrder: z.number().int(),
  })),
});

export default {
  setupCommerceSchema,
  syncArrangementSchema,
  createArrangementSchema,
  updateArrangementSchema,
  createSectionSchema,
  updateSectionSchema,
  reorderSectionsSchema,
  addItemSchema,
  reorderItemsSchema,
};
