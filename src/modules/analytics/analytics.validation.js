import { z } from 'zod';

export const overviewQuerySchema = z.object({
  days: z.coerce.number().int().optional(),
});
