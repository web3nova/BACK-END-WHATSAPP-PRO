import { asyncHandler } from '../../common/utils/asyncHandler.js';
import { ok } from '../../common/utils/apiResponse.js';
import { getTenantId } from '../../common/utils/tenantContext.js';
import * as onboardingService from './onboarding.service.js';
import { stepParamSchema, stepDataBodySchema } from './onboarding.validation.js';

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

export const getProgress = asyncHandler(async (req, res) => {
  const data = await onboardingService.getProgress(getTenantId(req));
  return ok(res, data);
});

export const markStepComplete = asyncHandler(async (req, res) => {
  const { step } = stepParamSchema.parse(req.params);
  const data = await onboardingService.markStepComplete(getTenantId(req), step, req.user.id);
  return ok(res, data);
});