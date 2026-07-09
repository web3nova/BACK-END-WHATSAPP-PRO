import { z } from 'zod';

const moneyCodeSchema = z.string().trim().length(3).transform((value) => value.toUpperCase());
const quoteStatusSchema = z.enum(['draft', 'sent', 'accepted', 'rejected', 'cancelled']);

export const quoteIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const listQuotesQuerySchema = z.object({
  status: quoteStatusSchema.optional(),
  customerId: z.string().uuid().optional(),
});

export const createQuoteSchema = z.object({
  customerId: z.string().uuid().optional().nullable(),
  conversationId: z.string().uuid().optional().nullable(),
  status: quoteStatusSchema.default('draft'),
  amountMinor: z.coerce.number().int().min(0).default(0),
  currency: moneyCodeSchema.default('NGN'),
  details: z.record(z.any()).default({}),
});

export const updateQuoteStatusSchema = z.object({
  status: quoteStatusSchema,
});

export const updateQuoteSchema = z.object({
  customerId: z.string().uuid().optional().nullable(),
  status: quoteStatusSchema.optional(),
  amountMinor: z.coerce.number().int().min(0).optional(),
  currency: moneyCodeSchema.optional(),
  details: z.record(z.any()).optional(),
});
