import { z } from 'zod';
import { BUSINESS_CATEGORIES } from '../../common/constants/businessProfile.js';

const normalizeCategory = (value) =>
  typeof value === 'string' ? value.trim().toLowerCase().replace(/\s+/g, '-') : value;

const categorySchema = z.preprocess(normalizeCategory, z.enum(BUSINESS_CATEGORIES));

const DELIVERY_STRUCTURES = ['self', 'third-party', 'pickup', 'mixed'];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

const businessShape = {
  // Core
  displayName: z.string().trim().min(1).max(100),
  category: categorySchema.optional(),
  categoryOther: z.string().trim().min(1).max(100).optional(),
  tagline: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().min(1).max(2000).optional(),
  email: z.string().trim().email().optional(),
  whatsappNumber: z.string().trim().min(7).max(30).optional(),
  logoUrl: z.string().url().optional(),
  settings: z.record(z.unknown()).optional().default({}),

  // Step 1 — Business identity
  phone: z.string().trim().min(7).max(30).optional(),
  location: z.string().trim().min(1).max(200).optional(),

  // Step 2 — Compliance
  cacNumber: z.string().trim().min(1).max(50).optional(),
  tin: z.string().trim().max(50).optional(),

  // Step 3 — Operations
  activeClients: z.coerce.number().int().min(0).optional(),
  staffCount: z.coerce.number().int().min(0).optional(),
  monthlyRevenue: z.coerce.number().int().min(0).optional(),
  deliveryStructure: z.enum(DELIVERY_STRUCTURES).optional(),

  // Step 4 — Presence & hours
  instagram: z.string().trim().max(60).optional(),
  twitter: z.string().trim().max(60).optional(),
  facebook: z.string().trim().max(100).optional(),
  tiktok: z.string().trim().max(60).optional(),
  availableDays: z.array(z.enum(DAYS)).min(1).optional(),
  openingTime: z.string().regex(TIME_REGEX, 'Use HH:MM format').optional(),
  closingTime: z.string().regex(TIME_REGEX, 'Use HH:MM format').optional(),
};

function requireOtherCategoryLabel(data, ctx) {
  if (data.category === 'others' && !data.categoryOther) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['categoryOther'],
      message: 'categoryOther is required when category is others.',
    });
  }
}

export const createBusinessSchema = z.object({
  ...businessShape,
  displayName: z.string().trim().min(1).max(100), // required on create
  phone: z.string().trim().min(7).max(30),         // required on create (Step 1)
  location: z.string().trim().min(1).max(200),     // required on create (Step 1)
}).superRefine(requireOtherCategoryLabel);

export const updateBusinessSchema = z
  .object(businessShape)
  .partial()
  .superRefine(requireOtherCategoryLabel);