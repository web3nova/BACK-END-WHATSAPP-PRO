import { z } from 'zod';

export const createBusinessSchema = z.object({
  displayName: z.string().min(1).max(100),
  description: z.string().optional(),
  logoUrl: z.string().url().optional(),
  settings: z.record(z.unknown()).optional().default({}),
});

export const updateBusinessSchema = createBusinessSchema.partial();
