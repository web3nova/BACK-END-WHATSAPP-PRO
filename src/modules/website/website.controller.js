import { asyncHandler } from '../../common/utils/asyncHandler.js';
import { ok, created, noContent } from '../../common/utils/apiResponse.js';
import { getTenantId } from '../../common/utils/tenantContext.js';
import * as websiteService from './website.service.js';

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

export const updateSettings = asyncHandler(async (req, res) => {
  const data = await websiteService.updateSettings(getTenantId(req), req.body);
  return ok(res, data);
});

export const getStorefront = asyncHandler(async (req, res) => {
  const data = await websiteService.getStorefront(req);
  return ok(res, data);
});
