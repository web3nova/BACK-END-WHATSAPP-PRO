import { asyncHandler } from '../../common/utils/asyncHandler.js';
import { ok, created, noContent } from '../../common/utils/apiResponse.js';
import { getTenantId } from '../../common/utils/tenantContext.js';
import { BadRequestError } from '../../common/errors/index.js';
import { prisma } from '../../config/prisma.js';
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

export const uploadImage = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new BadRequestError('No image uploaded. Send multipart/form-data with field "image".');
  }
  const data = await productService.uploadImage(req.params.id, getTenantId(req), req.file);
  return ok(res, data);
});

export const listCategories = asyncHandler(async (_req, res) => {
  return ok(res, productService.listCategories());
});

export const uploadGalleryImage = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new BadRequestError('No image uploaded. Send multipart/form-data with field "image".');
  }
  const data = await productService.uploadGalleryImage(req.params.id, getTenantId(req), req.file);
  return ok(res, data);
});

export const removeGalleryImage = asyncHandler(async (req, res) => {
  const { storageKey } = req.body;
  if (!storageKey) {
    throw new BadRequestError('storageKey is required.');
  }
  const data = await productService.removeGalleryImage(req.params.id, getTenantId(req), storageKey);
  return ok(res, data);
});

export const incrementView = asyncHandler(async (req, res) => {
  await prisma.product.update({
    where: { id: req.params.id },
    data: { viewCount: { increment: 1 } },
  });
  return ok(res, { success: true });
});

export const getPopular = asyncHandler(async (req, res) => {
  const tenantId = req.params.tenantId;
  if (!tenantId) throw new BadRequestError('tenantId is required');
  const products = await prisma.product.findMany({
    where: { tenantId, isActive: true },
    orderBy: [{ viewCount: 'desc' }, { cartCount: 'desc' }],
    take: parseInt(req.query.limit) || 10,
  });
  return ok(res, products);
});

export const getOg = asyncHandler(async (req, res) => {
  const data = await productService.getProductOg(req.params.id);
  return ok(res, data);
});
