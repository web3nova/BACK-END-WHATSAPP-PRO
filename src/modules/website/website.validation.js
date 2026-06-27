import { z } from 'zod';

export const listPagesSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const pageParamsSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens only.'),
});

export const createPageSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens only.'),
  title: z.string().trim().min(1).max(160),
  content: z.record(z.unknown()).optional().default({}),
  published: z.boolean().optional().default(false),
});

export const updatePageSchema = createPageSchema.omit({ slug: true }).partial();

export const publishPageSchema = z.object({
  published: z.boolean(),
});

export const updateWebsiteSettingsSchema = z.object({
  theme: z.record(z.unknown()).optional(),
  navigation: z.array(z.record(z.unknown())).optional(),
  seo: z.record(z.unknown()).optional(),
  social: z.record(z.unknown()).optional(),
  published: z.boolean().optional(),
});

export const storefrontQuerySchema = z
  .object({
    tenantId: z.string().uuid().optional(),
    slug: z.string().trim().min(1).optional(),
    domain: z.string().trim().min(1).optional(),
  })
  .strict();
