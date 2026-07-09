import { z } from 'zod';
import { asyncHandler } from '../../common/utils/asyncHandler.js';
import { ok } from '../../common/utils/apiResponse.js';
import { BadRequestError } from '../../common/errors/index.js';
import * as conversationService from './conversation.service.js';
import { addClient, removeClient } from '../sse/sse.service.js';

// Tenant helper similar to other controllers. Falls back to header for early testing.
function tenantId(req) {
    const id = req.tenant?.id || req.headers['x-tenant-id'];
    if (!id) throw new BadRequestError('Missing tenant context (req.tenant or x-tenant-id header).');
    return id;
}

const paginationSchema = z.object({
    page: z.preprocess((v) => parseInt(String(v || '1'), 10), z.number().int().positive()),
    limit: z.preprocess((v) => parseInt(String(v || '25'), 10), z.number().int().positive().max(100)),
});

const idParam = z.object({ id: z.string().min(1) });

export const getAll = asyncHandler(async (req, res) => {
    const tenant = tenantId(req);
    const parsed = paginationSchema.safeParse(req.query);
    if (!parsed.success) throw new BadRequestError('Invalid pagination parameters', parsed.error.flatten());

    const { page, limit } = parsed.data;
    const result = await conversationService.listConversations(tenant, { page, limit });
    return ok(res, result.data, result.meta);
});

export const getHistory = asyncHandler(async (req, res) => {
    const tenant = tenantId(req);
    const parsedParams = idParam.safeParse(req.params);
    if (!parsedParams.success) throw new BadRequestError('Invalid conversation id', parsedParams.error.flatten());

    const parsedQuery = paginationSchema.safeParse(req.query);
    if (!parsedQuery.success) throw new BadRequestError('Invalid pagination parameters', parsedQuery.error.flatten());

    const { page, limit } = parsedQuery.data;
    const messages = await conversationService.getConversationHistory(parsedParams.data.id, tenant, { page, limit });
    return ok(res, messages.data, messages.meta);
});

export const takeOver = asyncHandler(async (req, res) => {
    const tenant = tenantId(req);
    const parsedParams = idParam.safeParse(req.params);
    if (!parsedParams.success) throw new BadRequestError('Invalid conversation id', parsedParams.error.flatten());
    const updated = await conversationService.takeOver(parsedParams.data.id, tenant);
    return ok(res, { conversation: updated });
});

export const release = asyncHandler(async (req, res) => {
    const tenant = tenantId(req);
    const parsedParams = idParam.safeParse(req.params);
    if (!parsedParams.success) throw new BadRequestError('Invalid conversation id', parsedParams.error.flatten());
    const updated = await conversationService.release(parsedParams.data.id, tenant);
    return ok(res, { conversation: updated });
});

export const staffMessage = asyncHandler(async (req, res) => {
    const tenant = tenantId(req);
    const parsedParams = idParam.safeParse(req.params);
    if (!parsedParams.success) throw new BadRequestError('Invalid conversation id', parsedParams.error.flatten());
    const { text } = req.body;
    if (!text?.trim()) throw new BadRequestError('text is required');
    const message = await conversationService.sendStaffMessage(parsedParams.data.id, tenant, text.trim());
    return ok(res, { message });
});

export const streamEvents = (req, res) => {
  const tenant = tenantId(req);
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  res.write('event: connected\ndata: {}\n\n');

  addClient(tenant, res);

  const heartbeat = setInterval(() => {
    try { res.write(':ping\n\n'); } catch { clearInterval(heartbeat); }
  }, 25_000);

  req.on('close', () => {
    clearInterval(heartbeat);
    removeClient(tenant, res);
  });
};

export default { getAll, getHistory, resolve, streamEvents };
