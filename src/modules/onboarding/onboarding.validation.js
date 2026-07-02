import { z } from 'zod';
import { OVERRIDABLE_STEPS } from './onboarding.service.js';
import { DELIVERY_STRUCTURES, DAYS, TIME_REGEX } from '../business/business.validation.js';

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

// ---------------------------------------------------------------------------
// Business profile — one dynamic schema covering every field across all 4
// onboarding screens (identity, compliance, operations, presence & hours).
// Every field is individually optional so a caller can submit any single
// field, any subset, or the whole form in one PUT. Field names mirror the
// on-screen labels; the transform maps them to the matching Prisma
// `Business` column names so the service layer writes straight through
// without its own mapping logic. Required-ness of a *section* (e.g. you
// can't leave compliance half-filled) is not enforced here — it's derived
// from the saved Business row itself (see computeBusinessPanelStatus in
// onboarding.service.js), since a returning user editing one field of an
// already-complete section shouldn't have to resupply the rest of it.
// ---------------------------------------------------------------------------

export const businessProfileSchema = z
  .object({
    // Identity
    businessName: z.string().trim().min(1, 'Business name is required').max(100).optional(),
    phoneNumber: z.string().trim().min(7, 'Enter a valid phone number').max(30).optional(),
    businessLocation: z.string().trim().min(1, 'Business location is required').max(200).optional(),

    // Compliance
    cacRegistrationNumber: z.string().trim().min(1, 'CAC registration number is required').max(50).optional(),
    tin: z.string().trim().max(50).optional(),

    // Operations
    numberOfActiveClients: z.coerce.number().int().min(0).optional(),
    numberOfStaff: z.coerce.number().int().min(0).optional(),
    averageMonthlyRevenue: z.coerce.number().int().min(0).optional(),
    deliveryStructure: z.enum(DELIVERY_STRUCTURES).optional(),

    // Presence & hours
    instagram: z.string().trim().max(60).optional(),
    twitter: z.string().trim().max(60).optional(),
    facebookPage: z.string().trim().max(100).optional(),
    tiktok: z.string().trim().max(60).optional(),
    daysAvailable: z.array(z.enum(DAYS)).min(1, 'Select at least one day').optional(),
    openingTime: z.string().regex(TIME_REGEX, 'Use HH:MM 24-hour format').optional(),
    closingTime: z.string().regex(TIME_REGEX, 'Use HH:MM 24-hour format').optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field to update' })
  .transform((v) => ({
    displayName: v.businessName,
    phone: v.phoneNumber,
    location: v.businessLocation,
    cacNumber: v.cacRegistrationNumber,
    tin: v.tin,
    activeClients: v.numberOfActiveClients,
    staffCount: v.numberOfStaff,
    monthlyRevenue: v.averageMonthlyRevenue,
    deliveryStructure: v.deliveryStructure,
    instagram: v.instagram,
    twitter: v.twitter,
    facebook: v.facebookPage,
    tiktok: v.tiktok,
    availableDays: v.daysAvailable,
    openingTime: v.openingTime,
    closingTime: v.closingTime,
  }));