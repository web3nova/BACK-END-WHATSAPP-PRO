import { asyncHandler } from '../../common/utils/asyncHandler.js';
import { ok, created } from '../../common/utils/apiResponse.js';
import { getTenantId } from '../../common/utils/tenantContext.js';
import { BadRequestError } from '../../common/errors/index.js';
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

export const uploadLogo = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new BadRequestError('No logo uploaded. Send multipart/form-data with field "logo".');
  }
  const data = await businessService.uploadLogo(getTenantId(req), req.file);
  return ok(res, data);
});

export const listCategories = asyncHandler(async (_req, res) => {
  return ok(res, businessService.listCategories());
});
