import { asyncHandler } from '../../common/utils/asyncHandler.js';
import { ok, created } from '../../common/utils/apiResponse.js';
import { getTenantId } from '../../common/utils/tenantContext.js';
import * as reviewService from './review.service.js';

// Public — no auth. Tenant is derived from the product itself.
export const listPublicReviews = asyncHandler(async (req, res) => {
  const productId = req.params.id;
  const tenantId = await reviewService.getProductTenantId(productId);
  const result = await reviewService.getApprovedReviews(tenantId, productId, req.query);
  return ok(res, { items: result.items, average: result.average, count: result.count }, result.meta);
});

// Customer-authed.
export const getEligibility = asyncHandler(async (req, res) => {
  const productId = req.params.id;
  const { id: customerId, tenantId } = req.customer;
  await reviewService.findOwnedProduct(productId, tenantId);
  const result = await reviewService.checkEligibility(tenantId, customerId, productId);
  return ok(res, result);
});

export const submit = asyncHandler(async (req, res) => {
  const productId = req.params.id;
  const { id: customerId, tenantId } = req.customer;
  await reviewService.findOwnedProduct(productId, tenantId);
  const data = await reviewService.submitReview(tenantId, customerId, productId, req.body);
  return created(res, data);
});

// Dashboard/staff-authed.
export const list = asyncHandler(async (req, res) => {
  const result = await reviewService.listReviews(getTenantId(req), req.query);
  return ok(res, result.items, result.meta);
});

export const moderate = asyncHandler(async (req, res) => {
  const data = await reviewService.moderateReview(getTenantId(req), req.params.id, req.body.status);
  return ok(res, data);
});
