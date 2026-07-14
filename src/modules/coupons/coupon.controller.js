import { asyncHandler } from '../../common/utils/asyncHandler.js';
import { ok, created, noContent } from '../../common/utils/apiResponse.js';
import { getTenantId } from '../../common/utils/tenantContext.js';
import * as couponService from './coupon.service.js';

export const list = asyncHandler(async (req, res) => {
  const data = await couponService.listCoupons(getTenantId(req));
  return ok(res, data);
});

export const create = asyncHandler(async (req, res) => {
  const data = await couponService.createCoupon(getTenantId(req), req.body);
  return created(res, data);
});

export const update = asyncHandler(async (req, res) => {
  const data = await couponService.updateCoupon(getTenantId(req), req.params.id, req.body);
  return ok(res, data);
});

export const remove = asyncHandler(async (req, res) => {
  await couponService.deleteCoupon(getTenantId(req), req.params.id);
  return noContent(res);
});
