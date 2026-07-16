import { z } from 'zod';

export const overviewQuerySchema = z.object({
  days: z.coerce.number().int().optional(),
  // Exact start date, overrides `days` when given — lets a caller ask for a
  // calendar-bound range (e.g. "since the start of this month") instead of
  // one of the fixed day-count buckets.
  since: z.coerce.date().optional(),
});
