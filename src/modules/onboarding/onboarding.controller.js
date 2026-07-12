import { asyncHandler } from '../../common/utils/asyncHandler.js';
import { ok, created } from '../../common/utils/apiResponse.js';
import { getTenantId } from '../../common/utils/tenantContext.js';
import * as onboardingService from './onboarding.service.js';
import {
  stepParamSchema,
  stepDataBodySchema,
  tenantIdParamSchema,
  businessProfileSchema,
  createFrontendBusinessSchema,
  updateFrontendBusinessSchema,
} from './onboarding.validation.js';

export const getStatus = asyncHandler(async (req, res) => {
  const data = await onboardingService.getStatus(getTenantId(req));
  return ok(res, data);
});

export const getStepData = asyncHandler(async (req, res) => {
  const { step } = stepParamSchema.parse(req.params);
  const data = await onboardingService.getStepData(getTenantId(req), step);
  return ok(res, data);
});

// No admin permission required — the caller is reading/writing their own tenant's
// onboarding draft, same trust level as getStatus.
export const saveStepData = asyncHandler(async (req, res) => {
  const { step } = stepParamSchema.parse(req.params);
  const { data } = stepDataBodySchema.parse(req.body);
  const complete = req.query.complete === 'true';
  const record = await onboardingService.saveStepData(getTenantId(req), step, data, { complete });
  return ok(res, record);
});

export const completeOnboarding = asyncHandler(async (req, res) => {
  const record = await onboardingService.completeOnboarding(getTenantId(req), req.user.id);
  return ok(res, record);
});

export const getProgress = asyncHandler(async (req, res) => {
  const data = await onboardingService.getProgress(getTenantId(req));
  return ok(res, data);
});

// ---------------------------------------------------------------------------
// Business profile — a single dynamic endpoint covering every field across
// all 4 onboarding screens (identity, compliance, operations, presence &
// hours). Callers submit whichever subset of fields they want to edit; see
// businessProfileSchema for why every field is individually optional. Same
// trust level as saveStepData: the caller is reading/writing their own
// tenant's business record.
// ---------------------------------------------------------------------------

export const saveBusinessProfile = asyncHandler(async (req, res) => {
  const dbFields = businessProfileSchema.parse(req.body);
  const data = await onboardingService.saveBusinessProfile(getTenantId(req), dbFields, req.body);
  return ok(res, data);
});

export const getBusinessOnboarding = asyncHandler(async (req, res) => {
  const data = await onboardingService.getBusinessOnboarding(getTenantId(req));
  return ok(res, data);
});

export const markStepComplete = asyncHandler(async (req, res) => {
  const { step } = stepParamSchema.parse(req.params);
  const data = await onboardingService.markStepComplete(getTenantId(req), step, req.user.id);
  return ok(res, data);
});

// ---------------------------------------------------------------------------
// Admin-facing handlers.
//
// Option A (used here): explicit tenantId in the URL, gated by an
// 'onboarding:view' permission. This works today with zero service-layer
// changes because getStepData/getProgress already take tenantId as a plain
// argument rather than deriving it from request context. Every admin lookup
// is naturally auditable from the route + permission check alone.
//
// Option B (not wired up): let admins hit the *same* owner-facing routes
// (/onboarding/status, /onboarding/steps/:step, /onboarding/progress) by
// having an "impersonation" step in tenantContext.js — e.g. getTenantId(req)
// checks for a verified `x-impersonate-tenant-id` header (only honored when
// req.user has 'onboarding:view' and the header passes its own validation)
// and falls back to the caller's own tenant otherwise. That avoids duplicate
// route/controller code, but couples tenant-switching into the same helper
// every regular request relies on, so a bug there risks leaking across
// tenants for *all* routes, not just onboarding. Given you're not sure this
// mechanism already exists, Option A is the safer starting point — you can
// always fold these into Option B later if an impersonation layer appears.

export const getStepDataAdmin = asyncHandler(async (req, res) => {
  const { tenantId } = tenantIdParamSchema.parse(req.params);
  const { step } = stepParamSchema.parse(req.params);
  const data = await onboardingService.getStepData(tenantId, step);
  return ok(res, data);
});

export const getProgressAdmin = asyncHandler(async (req, res) => {
  const { tenantId } = req.params;
  const data = await onboardingService.getProgress(tenantId);
  return ok(res, data);
});

export const getBusinessOnboardingAdmin = asyncHandler(async (req, res) => {
  const { tenantId } = tenantIdParamSchema.parse(req.params);
  const data = await onboardingService.getBusinessOnboarding(tenantId);
  return ok(res, data);
});

// ---------------------------------------------------------------------------
// Frontend-facing onboarding endpoints — accept the exact field names the
// React wizard sends (businessName, cacRegNo, taxId, numClients, etc.) and
// map them to DB column names. CAC and TIN are optional.
// ---------------------------------------------------------------------------

export const createOnboarding = asyncHandler(async (req, res) => {
  const raw = req.body;
  const dbFields = createFrontendBusinessSchema.parse(raw);
  const data = await onboardingService.submitOnboarding(getTenantId(req), dbFields, raw);
  return created(res, data);
});

export const getOnboarding = asyncHandler(async (req, res) => {
  const data = await onboardingService.getBusinessOnboarding(getTenantId(req));
  return ok(res, data);
});

export const updateOnboarding = asyncHandler(async (req, res) => {
  const raw = req.body;
  const dbFields = updateFrontendBusinessSchema.parse(raw);
  const data = await onboardingService.submitOnboarding(getTenantId(req), dbFields, raw);
  return ok(res, data);
});