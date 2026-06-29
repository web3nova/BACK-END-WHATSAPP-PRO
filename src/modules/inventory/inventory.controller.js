import { asyncHandler } from '../../common/utils/asyncHandler.js';
import { ok } from '../../common/utils/apiResponse.js';
import { getTenantId } from '../../common/utils/tenantContext.js';
import * as inventoryService from './inventory.service.js';

export const list = asyncHandler(async (req, res) => {
  const result = await inventoryService.list(getTenantId(req), req.query);
  return ok(res, result.items, result.meta);
});

export const adjust = asyncHandler(async (req, res) => {
  const data = await inventoryService.adjust(req.params.productId, getTenantId(req), req.body);
  return ok(res, data);
});
