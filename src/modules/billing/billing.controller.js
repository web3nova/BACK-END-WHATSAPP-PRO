import * as billingService from './billing.service.js';
import { ok, created } from '../../common/utils/apiResponse.js';
import { asyncHandler } from '../../common/utils/asyncHandler.js';

export const getSubscription = asyncHandler(async (req, res) => {
  const subscription = await billingService.getSubscription(req.tenant.id);
  return ok(res, subscription);
});

export const createSubscription = asyncHandler(async (req, res) => {
  const subscription = await billingService.createSubscription(req.tenant.id, req.body);
  return created(res, subscription);
});

export const updateSubscription = asyncHandler(async (req, res) => {
  const subscription = await billingService.updateSubscription(req.tenant.id, req.body);
  return ok(res, subscription);
});

export const cancelSubscription = asyncHandler(async (req, res) => {
  const subscription = await billingService.cancelSubscription(req.tenant.id);
  return ok(res, subscription);
});

export const getLimits = asyncHandler(async (req, res) => {
  const limits = await billingService.getLimits(req.tenant.id);
  return ok(res, limits);
});