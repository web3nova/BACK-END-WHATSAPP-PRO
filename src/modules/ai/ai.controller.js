import { z } from 'zod';
import { asyncHandler } from '../../common/utils/asyncHandler.js';
import { ok } from '../../common/utils/apiResponse.js';
import { BadRequestError } from '../../common/errors/index.js';
import * as aiService from './ai.service.js';

// Tenant is normally attached by tenant.middleware; fall back to a header so
// the AI endpoints are usable before that middleware is wired up.
function tenantId(req) {
  const id = req.tenant?.id || req.headers['x-tenant-id'];
  if (!id) throw new BadRequestError('Missing tenant context (req.tenant or x-tenant-id header).');
  return id;
}

const chatSchema = z.object({
  conversationId: z.string().min(1),
  customerId: z.string().optional(),
  message: z.string().min(1),
});

export const chat = asyncHandler(async (req, res) => {
  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) throw new BadRequestError('Invalid chat payload', parsed.error.flatten());

  const result = await aiService.chat({ tenantId: tenantId(req), ...parsed.data });
  return ok(res, result);
});

export const resetMemory = asyncHandler(async (req, res) => {
  await aiService.resetMemory(req.params.conversationId);
  return ok(res, { reset: true });
});
