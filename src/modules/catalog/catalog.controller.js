import { z } from 'zod';
import { asyncHandler } from '../../common/utils/asyncHandler.js';
import { ok, created, noContent } from '../../common/utils/apiResponse.js';
import { BadRequestError } from '../../common/errors/index.js';
import * as catalogService from './catalog.service.js';

function tenantId(req) {
  const id = req.tenant?.id || req.headers['x-tenant-id'];
  if (!id) throw new BadRequestError('Missing tenant context (req.tenant or x-tenant-id header).');
  return id;
}

const formIngestSchema = z.object({
  name: z.string().min(1),
  items: z.array(z.record(z.unknown())).min(1),
});

export const list = asyncHandler(async (req, res) => {
  const result = await catalogService.list(tenantId(req), req.query);
  return ok(res, result.items, result.meta);
});

export const getById = asyncHandler(async (req, res) => {
  const data = await catalogService.getById(req.params.id, tenantId(req));
  return ok(res, data);
});

export const uploadCSV = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new BadRequestError('No file uploaded. Send multipart/form-data with field "file" (CSV).');
  }
  const name = (req.body.name || req.file.originalname).trim();
  const data = await catalogService.ingestCSV(tenantId(req), { name, buffer: req.file.buffer });
  return created(res, data);
});

export const ingestForm = asyncHandler(async (req, res) => {
  const parsed = formIngestSchema.safeParse(req.body);
  if (!parsed.success) throw new BadRequestError('Invalid catalog payload.', parsed.error.flatten());
  const data = await catalogService.ingestForm(tenantId(req), parsed.data);
  return created(res, data);
});

export const remove = asyncHandler(async (req, res) => {
  await catalogService.remove(req.params.id, tenantId(req));
  return noContent(res);
});
