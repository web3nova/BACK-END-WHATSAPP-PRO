import { asyncHandler } from '../../common/utils/asyncHandler.js';
import { ok } from '../../common/utils/apiResponse.js';
import { getTenantId } from '../../common/utils/tenantContext.js';
import * as onboardingService from './onboarding.service.js';
import { stepParamSchema } from './onboarding.validation.js';

export const getStatus = asyncHandler(async (req, res) => {
  const data = await onboardingService.getStatus(getTenantId(req));
  return ok(res, data);
});

export const markStepComplete = asyncHandler(async (req, res) => {
  const { step } = stepParamSchema.parse(req.params);
  const data = await onboardingService.markStepComplete(getTenantId(req), step, req.user.id);
  return ok(res, data);
});