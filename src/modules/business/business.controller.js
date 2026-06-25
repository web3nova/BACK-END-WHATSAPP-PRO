import { asyncHandler } from '../../common/utils/asyncHandler.js';
import { ok, created } from '../../common/utils/apiResponse.js';
import { BadRequestError } from '../../common/errors/index.js';
import * as businessService from './business.service.js';
import { createBusinessSchema, updateBusinessSchema } from './business.validation.js';

function tenantId(req) {
  const id = req.tenant?.id || req.headers['x-tenant-id'];
  if (!id) throw new BadRequestError('Missing tenant context (req.tenant or x-tenant-id header).');
  return id;
}

export const getProfile = asyncHandler(async (req, res) => {
  const data = await businessService.getProfile(tenantId(req));
  return ok(res, data);
});

export const createProfile = asyncHandler(async (req, res) => {
  const parsed = createBusinessSchema.safeParse(req.body);
  if (!parsed.success) throw new BadRequestError('Invalid business data.', parsed.error.flatten());
  const data = await businessService.createProfile(tenantId(req), parsed.data);
  return created(res, data);
});

export const updateProfile = asyncHandler(async (req, res) => {
  const parsed = updateBusinessSchema.safeParse(req.body);
  if (!parsed.success) throw new BadRequestError('Invalid business data.', parsed.error.flatten());
  const data = await businessService.updateProfile(tenantId(req), parsed.data);
  return ok(res, data);
});
