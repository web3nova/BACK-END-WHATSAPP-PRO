// src/modules/billing/billing.controller.js
import * as billingService from './billing.service.js';
import { ok, created } from '../../common/utils/apiResponse.js';
import { asyncHandler } from '../../common/utils/asyncHandler.js';

export const getPlans = asyncHandler(async (req, res) => {
  const plans = await billingService.getPlans();
  return ok(res, plans);
});

export const getSubscription = asyncHandler(async (req, res) => {
  const sub = await billingService.getSubscription(req.user?.tenantId ?? null);
  return ok(res, sub);
});

export const initializePayment = asyncHandler(async (req, res) => {
  const { planId } = req.body;
  const tenantId   = req.user.tenantId;
  const result     = await billingService.initializePayment(tenantId, planId);
  return ok(res, result);
});

export const webhook = asyncHandler(async (req, res) => {
  const signature = req.headers['monnify-signature'];
  const result    = await billingService.handleWebhook(req.body, signature);
  return ok(res, result);
});

// Admin only
export const upsertPlan = asyncHandler(async (req, res) => {
  const plan = await billingService.upsertPlan(req.body);
  return created(res, plan);
});