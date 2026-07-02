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
// Business wizard panels — one schema per screen in the onboarding UI.
// Field names mirror the on-screen labels; each transforms to the matching
// Prisma `Business` column names so the service layer can write straight
// through without its own mapping logic.
// ---------------------------------------------------------------------------

export const businessIdentitySchema = z
  .object({
    businessName: z.string().trim().min(1, 'Business name is required').max(100),
    phoneNumber: z.string().trim().min(7, 'Enter a valid phone number').max(30),
    businessLocation: z.string().trim().min(1, 'Business location is required').max(200),
  })
  .transform((v) => ({
    displayName: v.businessName,
    phone: v.phoneNumber,
    location: v.businessLocation,
  }));

export const businessComplianceSchema = z
  .object({
    cacRegistrationNumber: z.string().trim().min(1, 'CAC registration number is required').max(50),
    tin: z.string().trim().max(50).optional(),
  })
  .transform((v) => ({
    cacNumber: v.cacRegistrationNumber,
    tin: v.tin,
  }));

export const businessOperationsSchema = z
  .object({
    numberOfActiveClients: z.coerce.number().int().min(0),
    numberOfStaff: z.coerce.number().int().min(0),
    averageMonthlyRevenue: z.coerce.number().int().min(0),
    deliveryStructure: z.enum(DELIVERY_STRUCTURES),
  })
  .transform((v) => ({
    activeClients: v.numberOfActiveClients,
    staffCount: v.numberOfStaff,
    monthlyRevenue: v.averageMonthlyRevenue,
    deliveryStructure: v.deliveryStructure,
  }));

export const businessPresenceSchema = z
  .object({
    instagram: z.string().trim().max(60).optional(),
    twitter: z.string().trim().max(60).optional(),
    facebookPage: z.string().trim().max(100).optional(),
    tiktok: z.string().trim().max(60).optional(),
    daysAvailable: z.array(z.enum(DAYS)).min(1, 'Select at least one day'),
    openingTime: z.string().regex(TIME_REGEX, 'Use HH:MM 24-hour format').optional(),
    closingTime: z.string().regex(TIME_REGEX, 'Use HH:MM 24-hour format').optional(),
  })
  .transform((v) => ({
    instagram: v.instagram,
    twitter: v.twitter,
    facebook: v.facebookPage,
    tiktok: v.tiktok,
    availableDays: v.daysAvailable,
    openingTime: v.openingTime,
    closingTime: v.closingTime,
  }));