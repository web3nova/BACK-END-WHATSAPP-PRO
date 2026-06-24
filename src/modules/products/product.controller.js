import { asyncHandler } from '../../common/utils/asyncHandler.js';
import { ok, created, noContent } from '../../common/utils/apiResponse.js';
import { BadRequestError } from '../../common/errors/index.js';
import * as productService from './product.service.js';
import { createProductSchema, updateProductSchema } from './product.validation.js';

function tenantId(req) {
  const id = req.tenant?.id || req.headers['x-tenant-id'];
  if (!id) throw new BadRequestError('Missing tenant context (req.tenant or x-tenant-id header).');
  return id;
}

export const list = asyncHandler(async (req, res) => {
  const result = await productService.list(tenantId(req), req.query);
  return ok(res, result.items, result.meta);
});

export const getById = asyncHandler(async (req, res) => {
  const data = await productService.getById(req.params.id, tenantId(req));
  return ok(res, data);
});

export const create = asyncHandler(async (req, res) => {
  const parsed = createProductSchema.safeParse(req.body);
  if (!parsed.success) throw new BadRequestError('Invalid product data.', parsed.error.flatten());
  const data = await productService.create(tenantId(req), parsed.data);
  return created(res, data);
});

export const update = asyncHandler(async (req, res) => {
  const parsed = updateProductSchema.safeParse(req.body);
  if (!parsed.success) throw new BadRequestError('Invalid product data.', parsed.error.flatten());
  const data = await productService.update(req.params.id, tenantId(req), parsed.data);
  return ok(res, data);
});

export const remove = asyncHandler(async (req, res) => {
  await productService.remove(req.params.id, tenantId(req));
  return noContent(res);
});
