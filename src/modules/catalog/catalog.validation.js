import { z } from 'zod';

export const listCatalogsSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const catalogParamsSchema = z.object({
  id: z.string().uuid(),
});

export const ingestCatalogFormSchema = z.object({
  name: z.string().trim().min(1).max(120),
  items: z.array(z.record(z.unknown())).min(1),
});
