import { asyncHandler } from '../../common/utils/asyncHandler.js';
import { ok, created, noContent } from '../../common/utils/apiResponse.js';
import { getTenantId } from '../../common/utils/tenantContext.js';
import { BadRequestError } from '../../common/errors/index.js';
import * as websiteService from './website.service.js';

function normalizeHost(host = '') {
  const normalized = host.split(':')[0]?.toLowerCase();
  return normalized && !['localhost', '127.0.0.1', '0.0.0.0'].includes(normalized)
    ? normalized
    : undefined;
}

export const listPages = asyncHandler(async (req, res) => {
  const result = await websiteService.listPages(getTenantId(req), req.query);
  return ok(res, result.items, result.meta);
});

export const createPage = asyncHandler(async (req, res) => {
  const data = await websiteService.createPage(getTenantId(req), req.body);
  return created(res, data);
});

export const getPage = asyncHandler(async (req, res) => {
  const data = await websiteService.getPage(getTenantId(req), req.params.slug);
  return ok(res, data);
});

export const updatePage = asyncHandler(async (req, res) => {
  const data = await websiteService.updatePage(getTenantId(req), req.params.slug, req.body);
  return ok(res, data);
});

export const deletePage = asyncHandler(async (req, res) => {
  await websiteService.deletePage(getTenantId(req), req.params.slug);
  return noContent(res);
});

export const setPublished = asyncHandler(async (req, res) => {
  const data = await websiteService.setPublished(
    getTenantId(req),
    req.params.slug,
    req.body.published,
  );
  return ok(res, data);
});

export const getSettings = asyncHandler(async (req, res) => {
  const data = await websiteService.getSettings(getTenantId(req));
  return ok(res, data);
});

export const uploadImage = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new BadRequestError('No image uploaded. Send multipart/form-data with field "image".');
  }
  const data = await websiteService.uploadImage(getTenantId(req), req.file);
  return ok(res, data);
});

export const deleteImage = asyncHandler(async (req, res) => {
  await websiteService.deleteImage(getTenantId(req), req.body.storageKey);
  return noContent(res);
});

export const updateSettings = asyncHandler(async (req, res) => {
  const data = await websiteService.updateSettings(getTenantId(req), req.body);
  return ok(res, data);
});

export const getStorefront = asyncHandler(async (req, res) => {
  const tenantId = req.query.tenantId || req.headers['x-tenant-id'];
  const slug = req.query.slug;
  const domain =
    req.query.domain || normalizeHost(req.headers['x-forwarded-host'] || req.headers.host);
  const data = await websiteService.getStorefront({ tenantId, slug, domain });
  return ok(res, data);
});
