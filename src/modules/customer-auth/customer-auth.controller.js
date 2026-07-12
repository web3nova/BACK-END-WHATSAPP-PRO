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

export const googleLogin = asyncHandler(async (req, res) => {
  const { tenantId, idToken } = req.body;
  const data = await customerAuthService.googleLogin({ tenantId, idToken });
  ok(res, data);
});

export const passkeyRegisterStart = asyncHandler(async (req, res) => {
  const { customerId } = req.body;
  const tenantId = req.customer?.tenantId || req.body.tenantId;
  const data = await customerAuthService.passkeyRegisterStart({ tenantId, customerId });
  ok(res, data);
});

export const passkeyRegisterComplete = asyncHandler(async (req, res) => {
  const { customerId, credential } = req.body;
  const data = await customerAuthService.passkeyRegisterComplete({ customerId, credential });
  ok(res, data);
});

export const passkeyLoginStart = asyncHandler(async (req, res) => {
  const { tenantId } = req.body;
  const data = await customerAuthService.passkeyLoginStart({ tenantId });
  ok(res, data);
});

export const passkeyLoginComplete = asyncHandler(async (req, res) => {
  const { tenantId, credential } = req.body;
  const data = await customerAuthService.passkeyLoginComplete({ tenantId, credential });
  ok(res, data);
});

export const getProfile = asyncHandler(async (req, res) => {
  const data = await customerAuthService.getProfile(req.customer.id, req.customer.tenantId);
  ok(res, data);
});
