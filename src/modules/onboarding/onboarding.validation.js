import { z } from 'zod';
import { OVERRIDABLE_STEPS } from './onboarding.service.js';

export const stepParamSchema = z.object({
  step: z.enum(OVERRIDABLE_STEPS),
});

export const stepDataBodySchema = z.object({
  data: z
    .record(z.string(), z.unknown())
    .refine((obj) => Object.keys(obj).length > 0, { message: 'data must contain at least one field' }),
});