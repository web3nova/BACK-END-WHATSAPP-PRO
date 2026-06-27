import { asyncHandler } from '../../common/utils/asyncHandler.js';
import { ok, created, noContent } from '../../common/utils/apiResponse.js';
import { BadRequestError } from '../../common/errors/index.js';
import { getTenantId } from '../../common/utils/tenantContext.js';
import * as catalogService from './catalog.service.js';

export const list = asyncHandler(async (req, res) => {
  const result = await catalogService.list(getTenantId(req), req.query);
  return ok(res, result.items, result.meta);
});

export const getById = asyncHandler(async (req, res) => {
  const data = await catalogService.getById(req.params.id, getTenantId(req));
  return ok(res, data);
});

export const uploadCSV = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new BadRequestError(
      'No file uploaded. Send multipart/form-data with field "file" (CSV).',
    );
  }
  const name = (req.body.name || req.file.originalname).trim();
  const data = await catalogService.ingestCSV(getTenantId(req), { name, buffer: req.file.buffer });
  return created(res, data);
});

export const ingestForm = asyncHandler(async (req, res) => {
  const data = await catalogService.ingestForm(getTenantId(req), req.body);
  return created(res, data);
});

export const remove = asyncHandler(async (req, res) => {
  await catalogService.remove(req.params.id, getTenantId(req));
  return noContent(res);
});
