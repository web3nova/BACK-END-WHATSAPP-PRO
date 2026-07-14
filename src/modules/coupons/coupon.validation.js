import { z } from 'zod';

const couponShape = {
  code: z.string().trim().min(2).max(30),
  type: z.enum(['percent', 'fixed']),
  value: z.number().int().positive(),
  minSubtotal: z.number().int().nonnegative().optional(),
  expiresAt: z.string().datetime().optional(),
  maxUses: z.number().int().positive().optional(),
  active: z.boolean().optional().default(true),
};

function refinePercentValue(data, ctx) {
  if (data.type === 'percent' && data.value !== undefined && data.value > 100) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['value'],
      message: 'Percent coupon value must be between 1 and 100.',
    });
  }
}

export const createCouponSchema = z.object(couponShape).superRefine(refinePercentValue);

export const updateCouponSchema = z
  .object(couponShape)
  .partial()
  .superRefine(refinePercentValue);

export const couponParamsSchema = z.object({
  id: z.string().uuid(),
});
