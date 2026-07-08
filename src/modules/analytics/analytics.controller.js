import { asyncHandler } from '../../common/utils/asyncHandler.js';
import { ok } from '../../common/utils/apiResponse.js';
import { getTenantId } from '../../common/utils/tenantContext.js';
import * as analyticsService from './analytics.service.js';

export const getOverview = asyncHandler(async (req, res) => {
  const data = await analyticsService.getOverview(getTenantId(req), req.query);
  return ok(res, data);
});
