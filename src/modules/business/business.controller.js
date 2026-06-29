import { asyncHandler } from '../../common/utils/asyncHandler.js';
import { ok, created } from '../../common/utils/apiResponse.js';
import { getTenantId } from '../../common/utils/tenantContext.js';
import * as businessService from './business.service.js';

export const getProfile = asyncHandler(async (req, res) => {
  const data = await businessService.getProfile(getTenantId(req));
  return ok(res, data);
});

export const createProfile = asyncHandler(async (req, res) => {
  const data = await businessService.createProfile(getTenantId(req), req.body);
  return created(res, data);
});

export const updateProfile = asyncHandler(async (req, res) => {
  const data = await businessService.updateProfile(getTenantId(req), req.body);
  return ok(res, data);
});
