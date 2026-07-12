import { asyncHandler } from '../../common/utils/asyncHandler.js';
import { ok, created } from '../../common/utils/apiResponse.js';
import * as customerAuthService from './customer-auth.service.js';

export const signup = asyncHandler(async (req, res) => {
  const { tenantId, name, phone, password } = req.body;
  const data = await customerAuthService.signup({ tenantId, name, phone, password });
  created(res, data);
});

export const login = asyncHandler(async (req, res) => {
  const { tenantId, phone, password } = req.body;
  const data = await customerAuthService.login({ tenantId, phone, password });
  ok(res, data);
});

export const getProfile = asyncHandler(async (req, res) => {
  const data = await customerAuthService.getProfile(req.customer.id, req.customer.tenantId);
  ok(res, data);
});
