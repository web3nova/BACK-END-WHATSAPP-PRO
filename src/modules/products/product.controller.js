import { asyncHandler } from '../../common/utils/asyncHandler.js';
import { ok, created, noContent } from '../../common/utils/apiResponse.js';
import { getTenantId } from '../../common/utils/tenantContext.js';
import * as productService from './product.service.js';

export const list = asyncHandler(async (req, res) => {
  const result = await productService.list(getTenantId(req), req.query);
  return ok(res, result.items, result.meta);
});

export const getById = asyncHandler(async (req, res) => {
  const data = await productService.getById(req.params.id, getTenantId(req));
  return ok(res, data);
});

export const create = asyncHandler(async (req, res) => {
  const data = await productService.create(getTenantId(req), req.body);
  return created(res, data);
});

export const update = asyncHandler(async (req, res) => {
  const data = await productService.update(req.params.id, getTenantId(req), req.body);
  return ok(res, data);
});

export const remove = asyncHandler(async (req, res) => {
  await productService.remove(req.params.id, getTenantId(req));
  return noContent(res);
});
