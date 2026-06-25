import { z } from 'zod';
import { asyncHandler } from '../../common/utils/asyncHandler.js';
import { ok, created, noContent } from '../../common/utils/apiResponse.js';
import { BadRequestError } from '../../common/errors/index.js';
import * as websiteService from './website.service.js';

function tenantId(req) {
  const id = req.tenant?.id || req.headers['x-tenant-id'];
  if (!id) throw new BadRequestError('Missing tenant context (req.tenant or x-tenant-id header).');
  return id;
}

const pageSchema = z.object({
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens only.'),
  title: z.string().min(1),
  content: z.record(z.unknown()).optional().default({}),
  published: z.boolean().optional().default(false),
});

const updatePageSchema = pageSchema.omit({ slug: true }).partial();

export const listPages = asyncHandler(async (req, res) => {
  const result = await websiteService.listPages(tenantId(req), req.query);
  return ok(res, result.items, result.meta);
});

export const createPage = asyncHandler(async (req, res) => {
  const parsed = pageSchema.safeParse(req.body);
  if (!parsed.success) throw new BadRequestError('Invalid page data.', parsed.error.flatten());
  const data = await websiteService.createPage(tenantId(req), parsed.data);
  return created(res, data);
});

export const getPage = asyncHandler(async (req, res) => {
  const data = await websiteService.getPage(tenantId(req), req.params.slug);
  return ok(res, data);
});

export const updatePage = asyncHandler(async (req, res) => {
  const parsed = updatePageSchema.safeParse(req.body);
  if (!parsed.success) throw new BadRequestError('Invalid page data.', parsed.error.flatten());
  const data = await websiteService.updatePage(tenantId(req), req.params.slug, parsed.data);
  return ok(res, data);
});

export const deletePage = asyncHandler(async (req, res) => {
  await websiteService.deletePage(tenantId(req), req.params.slug);
  return noContent(res);
});

export const setPublished = asyncHandler(async (req, res) => {
  const { published } = req.body;
  if (typeof published !== 'boolean') {
    throw new BadRequestError('"published" must be a boolean.');
  }
  const data = await websiteService.setPublished(tenantId(req), req.params.slug, published);
  return ok(res, data);
});

export const getStorefront = asyncHandler(async (req, res) => {
  const data = await websiteService.getStorefront(tenantId(req));
  return ok(res, data);
});
