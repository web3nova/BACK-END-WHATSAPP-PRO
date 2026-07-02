import { z } from 'zod';
import { OVERRIDABLE_STEPS } from './onboarding.service.js';

export const stepParamSchema = z.object({
  step: z.enum(OVERRIDABLE_STEPS),
});