// src/modules/billing/billing.validation.js
import { z } from 'zod';

export const initPaymentSchema = z.object({
  planId: z.string().uuid('Invalid plan ID'),
});

export const upsertPlanSchema = z.object({
  name:         z.string().min(1),
  label:        z.string().min(1),
  priceMinor:   z.number().int().positive('Price must be a positive integer in kobo'),
  currency:     z.string().default('NGN'),
  intervalDays: z.number().int().positive(),
  isActive:     z.boolean().optional(),
});