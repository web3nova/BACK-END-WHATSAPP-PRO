import { z } from 'zod';
import { OVERRIDABLE_STEPS } from './onboarding.service.js';

export const stepParamSchema = z.object({
  step: z.enum(OVERRIDABLE_STEPS),
});

// Used by admin routes, which take the target tenant from the URL rather
// than from the caller's own auth context (see routes taking :tenantId).
export const tenantIdParamSchema = z.object({
  tenantId: z.string().min(1, 'tenantId is required'),
});

export const stepDataBodySchema = z.object({
  data: z
    .record(z.string(), z.unknown())
    .refine((obj) => Object.keys(obj).length > 0, { message: 'data must contain at least one field' }),
});