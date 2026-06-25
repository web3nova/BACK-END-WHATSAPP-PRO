import { z } from 'zod';

export const createSubscriptionSchema = z.object({
  plan: z.enum(['free', 'starter', 'pro','enterprise']),
});

export const updateSubscriptionSchema = z.object({
  plan:     z.enum(['free', 'starter', 'pro', 'enterprise']).optional(),
  status:   z.enum(['active', 'cancelled', 'past_due', 'trialing']).optional(),
  renewsAt: z.coerce.date().optional().nullable(),
});