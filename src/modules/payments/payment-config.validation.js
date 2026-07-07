import { z } from 'zod';

const bankAccountSchema = z.object({
  bankName: z.string().trim().min(1).max(100),
  bankCode: z.string().trim().min(1).max(10).optional(),
  accountName: z.string().trim().min(1).max(200),
  accountNumber: z.string().trim().regex(/^\d{10}$/, 'Account number must be 10 digits'),
});

const paystackSchema = z.object({
  isActive: z.boolean().optional().default(false),
  publicKey: z.string().trim().max(200).optional().or(z.literal('')),
  secretKey: z.string().trim().max(200).optional().or(z.literal('')),
});

const monnifySchema = z.object({
  isActive: z.boolean().optional().default(false),
  apiKey: z.string().trim().max(200).optional().or(z.literal('')),
  secretKey: z.string().trim().max(200).optional().or(z.literal('')),
  contractCode: z.string().trim().max(50).optional().or(z.literal('')),
});

const blockradarSchema = z.object({
  isActive: z.boolean().optional().default(false),
  apiKey: z.string().trim().max(200).optional().or(z.literal('')),
  secretKey: z.string().trim().max(200).optional().or(z.literal('')),
  webhookUrl: z.string().url().optional().or(z.literal('')),
});

const otherProviderSchema = z.object({
  name: z.string().trim().min(1).max(100),
  isActive: z.boolean().optional().default(true),
  publicKey: z.string().trim().max(200).optional(),
  secretKey: z.string().trim().max(200).optional(),
  webhookUrl: z.string().url().optional().or(z.literal('')),
});

export const updatePaymentConfigSchema = z.object({
  manual: z.object({
    isActive: z.boolean().optional().default(false),
    bankAccount: bankAccountSchema.optional().nullable(),
  }).optional(),
  paystack: paystackSchema.optional(),
  monnify: monnifySchema.optional(),
  blockradar: blockradarSchema.optional(),
  otherProviders: z.array(otherProviderSchema).optional(),
  preferredProvider: z.enum(['manual', 'paystack', 'monnify', 'blockradar', 'other']).optional(),
});
