import { z } from 'zod';
import { asyncHandler } from '../../common/utils/asyncHandler.js';
import { ok, created } from '../../common/utils/apiResponse.js';
import { BadRequestError } from '../../common/errors/index.js';
import * as knowledgeService from './knowledge.service.js';

function tenantId(req) {
  const id = req.tenant?.id || req.headers['x-tenant-id'];
  if (!id) throw new BadRequestError('Missing tenant context (req.tenant or x-tenant-id header).');
  return id;
}

// POST /knowledge/upload  (multipart/form-data, field: file)
export const upload = asyncHandler(async (req, res) => {
  if (!req.file) throw new BadRequestError('No file uploaded (expected form field "file").');
  const result = await knowledgeService.ingestDocument({ tenantId: tenantId(req), file: req.file });
  return created(res, result);
});

const searchSchema = z.object({
  q: z.string().min(1),
  topK: z.coerce.number().int().min(1).max(20).optional(),
});

// GET /knowledge/search?q=...&topK=5
export const search = asyncHandler(async (req, res) => {
  const parsed = searchSchema.safeParse(req.query);
  if (!parsed.success) throw new BadRequestError('Invalid search query', parsed.error.flatten());
  const matches = await knowledgeService.search({
    tenantId: tenantId(req),
    query: parsed.data.q,
    topK: parsed.data.topK,
  });
  return ok(res, matches);
});

// GET /knowledge/documents
export const listDocuments = asyncHandler(async (req, res) => {
  const docs = await knowledgeService.listDocuments(tenantId(req));
  return ok(res, docs);
});

// POST /knowledge/:id/retry
export const retryDocument = asyncHandler(async (req, res) => {
  const result = await knowledgeService.retryDocument(tenantId(req), req.params.id);
  return ok(res, result);
});

// DELETE /knowledge/:id
export const deleteDocument = asyncHandler(async (req, res) => {
  const result = await knowledgeService.deleteDocument(tenantId(req), req.params.id);
  return ok(res, result);
});
