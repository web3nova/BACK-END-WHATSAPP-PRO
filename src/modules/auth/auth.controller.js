// src/modules/auth/auth.controller.js
import * as authService from './auth.service.js';
import { ok, created } from '../../common/utils/apiResponse.js';
import { asyncHandler } from '../../common/utils/asyncHandler.js';

export const registerHandler = asyncHandler(async (req, res) => {
  const result = await authService.register(req.body);
  return created(res, result);
});

export const loginHandler = asyncHandler(async (req, res) => {
  const result = await authService.login(req.body);
  return ok(res, result);
});

export const refreshHandler = asyncHandler(async (req, res) => {
  const result = await authService.refresh(req.body);
  return ok(res, result);
});