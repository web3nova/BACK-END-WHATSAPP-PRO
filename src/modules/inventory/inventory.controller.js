import { z } from 'zod';
import { asyncHandler } from '../../common/utils/asyncHandler.js';
import { ok } from '../../common/utils/apiResponse.js';
import { BadRequestError } from '../../common/errors/index.js';
import * as inventoryService from './inventory.service.js';

function tenantId(req) {
  const id = req.tenant?.id || req.headers['x-tenant-id'];
  if (!id) throw new BadRequestError('Missing tenant context (req.tenant or x-tenant-id header).');
  return id;
}

const adjustSchema = z.object({
  quantity: z.number().int().min(0),
  operation: z.enum(['set', 'add', 'subtract']).default('set'),
});

export const list = asyncHandler(async (req, res) => {
  const result = await inventoryService.list(tenantId(req), req.query);
  return ok(res, result.items, result.meta);
});

export const adjust = asyncHandler(async (req, res) => {
  const parsed = adjustSchema.safeParse(req.body);
  if (!parsed.success) throw new BadRequestError('Invalid adjustment data.', parsed.error.flatten());
  const data = await inventoryService.adjust(req.params.productId, tenantId(req), parsed.data);
  return ok(res, data);
});
